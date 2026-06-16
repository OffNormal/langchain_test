# CLAUDE.md — 语音绘图工具

## 项目定位

纯语音控制的 Web 绘图工具。用户不触碰鼠标/键盘，仅通过自然语言完成绘图创作。MVP 阶段验证语音→绘图闭环可行性。

## 技术栈

| 层 | MVP | V1.0+ |
|----|-----|-------|
| 前端 | React 18 + TypeScript | — |
| 画布 | Fabric.js 6.x | — |
| LLM 调用 | LangChain (Prompt + OutputParser) | — |
| 流程编排 | LangGraph (StateGraph + Router) | 复合指令编排 (LangGraph 子图) |
| ASR | 讯飞流式 (WebSocket IAT) | — |
| NLU LLM | DeepSeek-V4 (`langchain_deepseek`) | 通义千问 / 智谱 GLM 备选 |
| 部署 | Vercel (Web) | Tauri (Desktop) |

## 架构

```
语音输入 → 讯飞 IAT WebSocket → 规则引擎(匹配?→直接返回) → LangGraph StateGraph → Command Parser → Fabric.js Canvas
                                  (前端本地 <5ms)              (Python API: 分类→路由→slot 提取)
```

V1.0 引入 LangGraph 管理意图路由，每个意图有专属处理节点和 prompt。后续可在此基础上扩展复合指令编排（LangGraph 子图）。

### 关键设计决策

1. **规则引擎优先**：高频简单指令（"画圆""撤销"）走规则匹配 <5ms，跳过 LLM
2. **LangGraph 意图路由**：规则未命中 → Python LangGraph StateGraph。分类器先判定意图，再路由到专属 handler 做 slot 提取。每个意图有独立 prompt，准确度高于单一大 prompt
3. **容错靠撤销**：语音识别不可能 100% 准确，核心策略是"快速执行 + 即时撤销"，而非过度防御
4. **Fabric.js 非自研 Canvas**：成熟对象模型和序列化能力，开发效率远高于裸 Canvas API

## 代码模块划分约定

项目按数据流管道拆分为 6 个独立模块。每个模块职责单一、接口明确、可独立开发和测试。**按依赖顺序从上到下开发**。

```
src/
├── voice/          ← 模块1: 语音采集 + ASR
├── nlu/            ← 模块2: 规则引擎 + LLM NLU (依赖: voice)
├── parser/         ← 模块3: Command Parser (依赖: nlu)
├── engine/         ← 模块4: Drawing Engine (依赖: parser)
├── state/          ← 模块5: 全局状态管理 (被所有模块共享)
└── ui/             ← 模块6: React UI 组件 (依赖: voice + engine + state)
```

### 模块1: voice/ — 语音采集与识别

| 项 | 说明 |
|----|------|
| **职责** | 麦克风采集、VAD 语音活动检测、ASR 转写，输出文本字符串 |
| **输入** | 用户语音（浏览器麦克风） |
| **输出** | `{ transcript: string; confidence: number }` |
| **对外接口** | `startListening(): void` / `stopListening(): string` |
| **依赖** | 讯飞 IAT WebSocket API + api/iflytek_auth.py 鉴权（无内部模块依赖） |
| **可独立测试** | 对着麦克风说话，console 打印转写文本 |
| **文件** | `voice/iflytek.ts`（讯飞 WebSocket 版）、`voice/speech.ts`（浏览器版，备用）、`voice/vad.ts` |

### 模块2: nlu/ — 自然语言理解

| 项 | 说明 |
|----|------|
| **职责** | 将 ASR 文本解析为结构化 NLUResult。内部含规则引擎(优先) + LangChain LLM(兜底) |
| **输入** | `transcript: string`（来自 voice 模块） |
| **输出** | `NLUResult`（见 specs/API.md §3.3） |
| **对外接口** | `parse(transcript: string): Promise<NLUResult>` |
| **依赖** | voice 模块、LangChain + DeepSeek API |
| **可独立测试** | 直接传入文本字符串（不连语音），验证 NLUResult 正确性 |
| **文件** | `nlu/rules.ts`（规则引擎）、`nlu/llm.ts`（LangChain Chain）、`nlu/index.ts`（聚合导出） |

### 模块3: parser/ — 指令解析器

| 项 | 说明 |
|----|------|
| **职责** | NLUResult → DrawCommand。坐标解析、颜色 Hex 映射、参数校验、默认值填充 |
| **输入** | `NLUResult`（来自 nlu 模块） |
| **输出** | `DrawCommand`（见 specs/API.md §4.1） |
| **对外接口** | `parseToCommand(nlu: NLUResult): DrawCommand` |
| **依赖** | nlu 模块（只依赖类型）、SPEC.md 参考数据（颜色表、形状默认参数） |
| **可独立测试** | 构造 NLUResult 对象输入，验证 DrawCommand 坐标和颜色正确 |
| **文件** | `parser/coords.ts`（坐标解析）、`parser/colors.ts`（颜色映射）、`parser/defaults.ts`（默认值）、`parser/index.ts` |

### 模块4: engine/ — 绘图引擎

| 项 | 说明 |
|----|------|
| **职责** | DrawCommand → Fabric.js Canvas 渲染。对象 CRUD、图层、Undo/Redo 历史栈 |
| **输入** | `DrawCommand`（来自 parser 模块） |
| **输出** | Canvas DOM 更新（副作用） |
| **对外接口** | `execute(cmd: DrawCommand): void` / `undo(): void` / `redo(): void` |
| **依赖** | parser 模块（只依赖类型）、Fabric.js、state 模块（读写 DrawingState） |
| **可独立测试** | 构造 DrawCommand 对象，验证 Canvas 上出现正确图形 |
| **文件** | `engine/shapes.ts`（图形创建）、`engine/modify.ts`（修改/删除）、`engine/history.ts`（撤销栈）、`engine/index.ts` |

### 模块5: state/ — 全局状态管理

| 项 | 说明 |
|----|------|
| **职责** | 维护全局 DrawingState（见 specs/SPEC.md §2.3），提供读写接口和变更通知 |
| **输入** | 各模块的读写调用 |
| **输出** | `DrawingState` 快照 + 变更事件 |
| **对外接口** | `getState(): DrawingState` / `dispatch(action): void` / `subscribe(fn): unsubscribe` |
| **依赖** | 无外部模块依赖（纯状态容器） |
| **可独立测试** | 直接 dispatch action，检查 state 变化 |
| **文件** | `state/store.ts`、`state/actions.ts`、`state/types.ts` |

### 模块6: ui/ — React 前端界面

| 项 | 说明 |
|----|------|
| **职责** | 语音输入按钮/波形、ASR 文本回显、Canvas 画布容器、操作反馈 Toast、可选控制面板 |
| **输入** | 用户点击/按键 + voice 模块事件 + state 变更 |
| **输出** | 浏览器 DOM |
| **依赖** | voice + engine + state 模块 |
| **可独立测试** | Playwright 端到端或 React 组件单测 |
| **文件** | `ui/VoiceWidget.tsx`、`ui/CanvasView.tsx`、`ui/FeedbackOverlay.tsx`、`ui/App.tsx` |

### 模块间依赖链

```
voice ──→ nlu ──→ parser ──→ engine ──→ ui
                                  │        │
                                  └── state ──┘
```

- **开发顺序**: state → voice → nlu → parser → engine → ui
- **每个模块完成后可立即验证**：voice 对麦说话看文本 / nlu 传文本看 NLU / parser 传 NLU 看 Command / engine 传 Command 看 Canvas
- **模块间通过明确的 TypeScript 接口通信**，不跨模块直接引用内部实现
- **state 模块只被 engine（写）和 ui（读）依赖**，voice/nlu/parser 为无状态纯函数

## 启动与运行

```bash
# 首次安装
npm install
cp .env.example .env.local   # 填入 DeepSeek API Key

# 开发
npm run dev                   # 启动前端 (默认 localhost:5173)

# 检查
npm run build                 # 生产构建
npm run lint                  # ESLint
npm run test                  # Vitest 单元测试
```

## LangGraph 调用模式

LangGraph 运行在 **前端同仓库的 Python 轻量 API 服务** 中（`api/` 目录），前端通过 HTTP POST 调用。

```
浏览器 → POST /api/nlu { text } → Python FastAPI → LangGraph StateGraph → DeepSeek → NLUResult
                                       │
                    ┌──────────────────┼──────────────────────┐
                    ▼                  ▼                      ▼
              classify_intent    create_shape_handler    modify_object_handler  ...
              (LLM call 1)       (LLM call 2, 按意图路由)
```

```python
# api/nlu.py — LangGraph StateGraph
from langgraph.graph import StateGraph, START, END
from langchain_core.prompts import ChatPromptTemplate
from langchain_deepseek import ChatDeepSeek

# State
class NLUState(BaseModel):
    user_input: str
    intent: str = "QUERY"
    confidence: float = 0.0
    slots: dict = {}

# Graph: 分类 → 路由 → 意图 handler → END
builder = StateGraph(NLUState)
builder.add_node("classify_intent", classify_intent)
builder.add_node("create_shape_handler", create_shape_handler)
# ... 6 个 handler 节点
builder.add_edge(START, "classify_intent")
builder.add_conditional_edges("classify_intent", route_by_intent, {...})
graph = builder.compile()

@app.post("/api/nlu")
async def nlu(req: NLURequest) -> NLUResult:
    state = await graph.ainvoke({"user_input": req.text})
    return NLUResult(intent=state["intent"], confidence=state["confidence"], slots=state["slots"])
```

降级链：规则引擎（前端本地 <5ms）→ LangGraph LLM → 节点异常兜底（分类失败→QUERY confidence=0）

详细设计见 `specs/PLAN_LANGGRAPH.md`。

### 所需环境变量

```bash
# .env.example
DEEPSEEK_API_KEY=sk-xxx           # DeepSeek API 密钥（MVP 必填）
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

## 核心数据结构

```typescript
// NLU 输出 → Command Parser 输入 (见 specs/API.md §3.3)
interface NLUResult {
  intent: 'CREATE_SHAPE' | 'MODIFY_OBJECT' | 'DELETE_OBJECT' | 'NAVIGATE' | 'FILE_OPERATION' | 'QUERY';
  confidence: number;
  slots: { shape_type?, fill_color?, radius?, width?, height?, position?, target_ref?, property?, value?, ... };
}

// Command Parser 输出 → Drawing Engine 输入 (见 specs/API.md §4.1)
interface DrawCommand {
  action: 'draw' | 'modify' | 'delete' | 'navigate' | 'file' | 'undo' | 'redo';
  target: string;
  params: Record<string, any>;
  idempotency_key: string;
}

// 全局画布状态 (见 specs/SPEC.md §2.3)
interface DrawingState {
  canvas: { width, height, zoom, panX, panY };
  layers: Layer[];
  objects: DrawObject[];
  history: { undoStack: Command[]; redoStack: Command[] };
  context: { lastReferencedId: string; lastAction: string };
}
```

## 性能目标 (MVP)

| 环节 | 目标 |
|------|------|
| 音频采集 + VAD | <200ms |
| ASR (浏览器 Speech API) | <800ms |
| NLU (LLM) | <1500ms |
| Canvas 渲染 | <200ms |
| **端到端 P50** | **<3s** |

## 容错机制

- **ASR**：拼音白名单 + 领域词汇优先（"园"→"圆"，"宏色"→"红色"）
- **NLU**：高置信直接执行，低置信提示重述
- **LLM 故障**：LangChain Fallback → 规则引擎兜底
- **用户侧**：说"撤销"即可回退任何操作

## MVP 功能范围

5 种几何图形（直线/圆/矩形/三角形/箭头）、颜色操作（20+ 预设 + Hex）、画布导航（缩放/平移）、撤销/重做、导出 PNG/SVG。

语音指令语法：`[动作] [目标对象] [参数]`（如 "画一个红色的圆" / "把它改成蓝色" / "撤销"）。

## 约束

- 浏览器：Chrome/Edge 114+
- MVP 需联网（LLM API 调用）
- 所有 LLM 调用通过 LangChain 统一接口，方便模型切换
- 参考数据（颜色映射、形状默认参数、术语）以 specs/SPEC.md 为唯一权威来源

## Git 提交约束

### Claude Code 与 Git 的协作方式

**分工边界**（由 `settings.json` 的 permissions 强制执行）:

| 操作 | Claude 负责 | 用户负责 |
|------|-----------|---------|
| `git status` / `git diff` / `git log` | ✅ 随时执行 | — |
| `git add` / `git commit` | ✅ 每完成一个功能点自动执行 | — |
| 写 commit message | ✅ 按 `<type>(<scope>): <描述>` 格式 | — |
| `git push` | ❌ 禁止 | ✅ 用户自行推送 |
| `git merge` / `git rebase` | ❌ 禁止 | ✅ 用户自行合并 |
| 创建分支 | ❌ 禁止 | ✅ 用户按 `feature/<模块>-<功能>` 创建 |
| 解决冲突 | ❌ 禁止 | ✅ 用户自行处理 |

**设计意图**: Claude 在本地自由提交，确保每个改动都有追溯记录；用户保留所有远程操作的控制权，避免误推送或冲突。

**典型工作流**:

```
用户创建分支: git checkout -b feature/voice-asr
       ↓
Claude 写代码 → git add → git commit (循环多次)
       ↓
用户检查: git log --oneline
       ↓
用户推送: git push origin feature/voice-asr
       ↓
用户创建 PR / 合并
```

### 提交时机（必须遵守）

**每完成一个功能或修复一个 bug，立即提交。** 不允许积累多个改动后批量提交。这是强制约束，不是建议。

具体时机：
- 写完一个模块的一个函数/文件，且该模块的独立测试通过 → 立即 commit
- 修复一个 bug → 立即 commit
- 更新 specs 文档的一个事实 → 立即 commit

### 提交粒度

一个模块的一个完整功能点 = 一个 commit。禁止堆积多个模块的改动后再批量提交。

```
✅ 好的提交:
  feat(voice): 实现浏览器 Speech API 语音采集
  feat(nlu): 添加规则引擎，匹配 5 种创建指令
  feat(parser): 实现坐标解析和颜色 Hex 映射
  fix(engine): 修复 Undo 后 Canvas 未重新渲染

❌ 坏的提交:
  feat: 完成 voice、nlu、parser 三个模块  (粒度太粗)
  wip                                                        (无意义信息)
  fix bug                                                    (描述不具体)
```

### 提交信息格式

```
<type>(<scope>): <简短描述>

type:   feat / fix / refactor / docs / test / chore
scope:  voice | nlu | parser | engine | state | ui | specs
```

scope 必须对应代码模块划分约定的模块之一：

| scope | 对应目录 |
|-------|---------|
| `voice` | `src/voice/` |
| `nlu` | `src/nlu/` |
| `parser` | `src/parser/` |
| `engine` | `src/engine/` |
| `state` | `src/state/` |
| `ui` | `src/ui/` |
| `api` | `api/` (Python LangChain 服务) |
| `specs` | `specs/` (文档改动，type 用 `docs`) |

### 分支策略

- `main` — 可运行的最新版本，禁止直接推送
- `feature/<模块名>-<功能>` — 功能分支，如 `feature/voice-asr`、`feature/nlu-rules`

### 提交前检查

- [ ] 模块可独立编译（`tsc --noEmit` 通过）
- [ ] 该模块的独立测试通过（按模块划分约定中的测试方式验证）
- [ ] 提交信息 scope 与改动的模块一致

### 禁止提交的内容

- API 密钥、`.env` 文件（使用 `.env.example` 模板）
- `node_modules/`、`dist/`、`.next/`
- 调试用的 `console.log`（除非是 voice 模块的 ASR 调试日志）

## 推荐使用的 Skills

以下 Claude Code 内置 Skills 与本项目高度匹配。开发过程中优先调用，而非手动执行等效操作。

| Skill | 使用阶段 | 用途 |
|-------|---------|------|
| **`webapp-testing`** | engine / ui / 集成 | Playwright 打开浏览器测试语音→绘图流程，截图验证 Canvas 渲染结果，查看浏览器控制台日志 |
| **`code-review`** | 每个模块完成后 | 对当前改动做代码审查，检查 bug 和简化机会 |
| **`simplify`** | 重构时 | 清理冗余、简化逻辑 |
| **`frontend-design`** | ui 模块 | 设计语音波形动效、反馈 Toast、指令提示卡等组件时参考 |
| **`verify`** | 功能完成后 | 启动 `npm run dev` 跑一遍完整流程确认功能可用 |

### 典型使用场景

```
写完 engine/shapes.ts → /code-review 审查
修复 undo bug       → git commit → /verify 跑起来确认
完成 ui/VoiceWidget → /webapp-testing 截图看麦克风按钮和波形
```

## 文件地图

### 项目配置

| 文件 | 内容 |
|------|------|
| `package.json` | 前端依赖与脚本 |
| `tsconfig.json` | TypeScript 配置 |
| `.env.example` | 环境变量模板（DEEPSEEK_API_KEY） |
| `.gitignore` | 排除 node_modules / dist / .env |

### 源码目录

| 目录 | 内容 |
|------|------|
| `src/voice/` | 模块1: 语音采集与 ASR |
| `src/nlu/` | 模块2: 规则引擎 + LLM NLU |
| `src/parser/` | 模块3: Command Parser |
| `src/engine/` | 模块4: Drawing Engine |
| `src/state/` | 模块5: 全局状态管理 |
| `src/ui/` | 模块6: React UI 组件 |
| `api/` | Python FastAPI 服务（LangChain NLU endpoint） |

### 设计文档

| 文件 | 内容 |
|------|------|
| `specs/PRD_01.md` | 产品需求：愿景、用户、功能范围、交互语法、指标、验收标准 |
| `specs/ARCHITECTURE.md` | 架构设计：架构图、数据流、组件职责、设计决策、风险矩阵 |
| `specs/SPEC.md` | 技术规范：技术栈表、LangChain 集成、DrawingState、性能目标、容错、颜色/形状/术语参考表 |
| `specs/API.md` | 接口契约：ASR 接口、NLUResult/DrawCommand Schema、指令 JSON 示例、语音指令表(含版本标记)、Canvas 操作 |
| `specs/PLAN_LANGGRAPH.md` | V1.0 计划：LangGraph StateGraph 迁移方案（2 次 LLM 调用、7 节点、6 handler prompt） |
| `CLAUDE.md` | 本文件：项目全局指南 |

修改任何事实时，请确保只更新权威来源文件。颜色/形状/术语 → SPEC；接口 Schema → API；架构决策 → ARCHITECTURE；产品需求 → PRD_01。

---

## Claude Code 行为准则

> 以下为 Claude Code 编码行为规范（英文原文），用于约束 AI 的代码生成质量。与上方的项目规范配合使用：上方约束"做什么"，下方约束"怎么做"。

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
