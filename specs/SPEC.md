# 语音绘图工具 — 技术规范

> **版本**: v1.0 | **日期**: 2026-06-15

本文档是技术实现的**唯一参考数据源**。所有查找表、配置常量、Schema 定义以此为准。

---

## 1. 技术栈

| 层 | MVP | V1.0+ |
|----|-----|-------|
| 前端框架 | React 18 + TypeScript | — |
| 画布渲染 | Fabric.js 6.x | — |
| LLM 调用 | LangChain (Prompt + Output Parser) | — |
| 流程编排 | — (LangChain 直链) | LangGraph (StateGraph + Router) |
| ASR | 浏览器 Speech API | 讯飞流式 ASR |
| NLU LLM | DeepSeek-V3 (`langchain_deepseek`) | 通义千问 (`langchain_tongyi`) / 智谱 GLM (`langchain_zhipu`) 备选 |
| 部署 | Vercel (Web) | Tauri (Desktop) |

---

## 2. LangChain 集成规范

### 2.1 调用链

```python
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from langchain_deepseek import ChatDeepSeek

llm = ChatDeepSeek(model="deepseek-chat", temperature=0.1)
prompt = ChatPromptTemplate.from_messages([
    ("system", "你是绘图指令解析器，将用户语音解析为结构化指令。"),
    ("user", "{user_input}")
])
parser = JsonOutputParser(pydantic_object=DrawingCommand)
chain = prompt | llm | parser
```

### 2.2 降级链

```
规则引擎 匹配? → Yes → 直接返回 (<5ms)
           │ No
           └→ LangChain LLM Chain → 成功 → 返回
                                  → 失败 → 重试 1 次 → 仍失败 → 友好提示
```

### 2.3 DrawingState Schema

```typescript
interface DrawingState {
  canvas: { width: number; height: number; zoom: number; panX: number; panY: number };
  layers: Layer[];
  activeLayerId: string;
  objects: DrawObject[];
  selectedIds: string[];
  history: {
    undoStack: Command[];  // 最多 100 步
    redoStack: Command[];
  };
  context: {
    lastReferencedId: string;
    lastAction: string;
  };
}
```

---

## 3. 性能目标

| 环节 | MVP | V1.0 |
|------|-----|------|
| 音频采集 + VAD | <200ms | <100ms |
| ASR | <800ms | <400ms |
| NLU (LLM) | <1500ms | <800ms |
| Canvas 渲染 | <200ms | <100ms |
| **端到端 P50** | **<3s** | **<1.4s** |

**MVP 策略**: 规则引擎优先 (<5ms)；LLM 仅复杂指令调用；乐观渲染（提前准备 Canvas）。

---

## 4. 容错机制

核心原则: **"快速执行 + 即时撤销"**

| 层面 | 策略 |
|------|------|
| ASR | 拼音白名单 + 领域词汇优先（"园"→"圆"，"宏色"→"红色"） |
| NLU | 置信度分层：高→直接执行，低→提示重述 |
| LLM 故障 | LangChain Fallback → 规则引擎兜底 |

用户纠错: 说"撤销"即可 ("撤销"→回退1步 / "撤销3步"→批量 / "不对"→快捷撤销)。

---

## 5. 参考数据表

### 5.1 颜色映射

| 口语 | Hex | 口语 | Hex |
|------|-----|------|-----|
| 红 | #EF4444 | 深红 | #991B1B |
| 橙 | #F97316 | 浅橙 | #FDBA74 |
| 黄 | #EAB308 | 金黄 | #F59E0B |
| 绿 | #22C55E | 浅绿 | #86EFAC |
| 蓝 | #3B82F6 | 浅蓝 | #93C5FD |
| 紫 | #A855F7 | 浅紫 | #D8B4FE |
| 粉 | #EC4899 | 浅粉 | #F9A8D4 |
| 黑 | #000000 | 灰 | #6B7280 |
| 白 | #FFFFFF | 浅灰 | #D1D5DB |
| 青 | #06B6D4 | 深蓝 | #1E3A5F |
| 棕 | #92400E | 透明 | rgba(0,0,0,0) |

### 5.2 形状-参数映射

| 形状 | 默认值 | 可选参数 |
|------|--------|---------|
| circle | r=100, center, fill=black, strokeWidth=2 | cx, cy, r, fill, stroke |
| rect | 200×150, center, fill=black, rx=0 | x, y, w, h, rx, fill, stroke |
| triangle | equilateral(150), center | points, fill, stroke |
| line | (0,0)→(100,100), stroke=black, strokeWidth=2 | x1, y1, x2, y2 |
| arrow | (0,0)→(150,0), fill=black | direction, from, to |
| ellipse | rx=150, ry=100, center | cx, cy, rx, ry, fill |
| polygon | sides=6, center | points, fill, stroke |
| text | fontSize=16, sans-serif, center | content, x, y, font, fill |

### 5.3 术语表

| 术语 | 说明 |
|------|------|
| ASR | 语音→文本 |
| NLU | 文本→意图+参数 |
| VAD | 语音活动检测 |
| PTT | 按键说话模式 |
| LangChain | LLM 调用框架（Prompt/模型/输出） |
| LangGraph | [V1.0+] 有状态流程编排（StateGraph/Router） |
| 指代消解 | 解析"它""这个"的指向 |
| 乐观渲染 | 不等待确认直接渲染 |

---

> *接口契约见 [API.md](API.md)，架构设计见 [ARCHITECTURE.md](ARCHITECTURE.md)，产品需求见 [PRD_01.md](PRD_01.md)。*
