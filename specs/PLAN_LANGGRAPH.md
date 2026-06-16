# LangGraph 流程编排迁移计划

> **分支**: `feature/v1.0-langgraph` | **日期**: 2026-06-16 | **状态**: 待实施

## 背景

MVP 的 NLU 后端 (`api/nlu.py`) 使用单一 LCEL chain 处理所有意图类型：

```python
chain = ChatPromptTemplate.from_messages([
    ("system", "你是绘图指令解析器..."),  # 一个巨大 prompt 覆盖 6 种意图
    ("user", "{user_input}")
]) | llm | JsonOutputParser(pydantic_object=NLUResult)
```

V1.0 用 LangGraph StateGraph + Router 替换，每个意图有专属 prompt 和处理节点。提升准确度、降低 token 消耗，并为后续复合指令（如"画三个红色的圆"）打下编排基础。

## 目标架构

```
                ┌──────────────────────────────────────────┐
                │           LangGraph StateGraph             │
                │                                            │
  user_input ──→ classify_intent ──→ [route_by_intent]      │
                   (LLM call 1)        │                    │
                                       │                    │
              ┌────────────────────────┼────────────────────┤
              │                        │                    │
              ▼                        ▼                    │
    CREATE_SHAPE              MODIFY_OBJECT                ...
    handler (LLM call 2)      handler (LLM call 2)         │
              │                        │                    │
              └────────────────────────┼────────────────────┤
                                       │                    │
                                       ▼                    │
                                 NLUResult ◄───────────────┘
```

- **2 次 LLM 调用**：① 分类器（短 prompt，只输出 intent+confidence）→ ② 意图专属 handler（长 prompt，输出该意图 slots）
- **7 个节点**：1 个分类器 + 6 个意图 handler
- **1 个条件路由**：按 intent 字符串分发到对应 handler

## 改动范围

### 生产代码（2 个文件）

#### 1. `api/nlu.py` — 重写

**State Schema**（BaseModel）:

```python
class NLUState(BaseModel):
    user_input: str
    intent: str = "QUERY"
    confidence: float = 0.0
    slots: dict = {}
```

**7 个 Prompt**:

| Prompt | 用途 | 大小 |
|--------|------|------|
| `CLASSIFY_PROMPT` | 仅输出 `{"intent": "...", "confidence": 0.9}` | ~50 token |
| `CREATE_SHAPE_PROMPT` | 形状参数提取（shape_type, radius, fill_color, position...） | ~200 token |
| `MODIFY_OBJECT_PROMPT` | 修改参数提取（target_ref, property, value） | ~150 token |
| `DELETE_OBJECT_PROMPT` | 删除目标提取（target_ref） | ~80 token |
| `NAVIGATE_PROMPT` | 导航参数提取（zoom_level, pan_direction, pan_distance） | ~120 token |
| `FILE_OPERATION_PROMPT` | 文件操作提取（file_action, format） | ~120 token |
| `QUERY_PROMPT` | 确认 query 意图，空 slots | ~50 token |

**关键设计决策**:

| 决策 | 选择 | 理由 |
|------|------|------|
| 会话状态 | Stateless（不引入 checkpointer） | 无需 session 管理，每次请求独立 |
| LLM 调用次数 | 2 次（分类 + 填充） | 分类器用短 prompt 节省 token，handler 专注 slot 提取 |
| 节点函数 | `async def` + `chain.ainvoke()` | 与 FastAPI async endpoint 一致 |
| 温度 | 统一 0.1 | 简化，单一 LLM 实例 |
| 容错 | 每个节点 try/except，失败返回兜底值 | 分类失败→QUERY confidence=0；handler 失败→空 slots |
| API 契约 | `POST /api/nlu` 不变 | 零前端改动 |

#### 2. `api/requirements.txt` — 加一行

```
langgraph>=1.0.0
```

### 不改动的文件

| 文件 | 原因 |
|------|------|
| `src/nlu/llm.ts` | API 契约不变，endpoint/request/response 一致 |
| `src/nlu/rules.ts` | 规则引擎在前端，不涉及 LangGraph |
| `src/nlu/types.ts` | 纯 TypeScript 接口，不变 |
| `src/parser/index.ts` | 消费 NLUResult，schema 不变 |
| `src/engine/` | 消费 DrawCommand，不变 |
| `api/iflytek_auth.py` | ASR 鉴权路由，不涉及 |

## 验证计划

1. **Python 导入检查**: `python -c "from api.nlu import get_graph; get_graph()"` — graph 编译成功
2. **API 兼容测试**: curl 发送已知指令，验证 NLUResult schema 正确
3. **TypeScript 编译**: `npx tsc --noEmit` — 前端无改动，确保通过
4. **端到端**: `npm run dev` → 语音输入走 LLM 路径 → Canvas 正确渲染
5. **生产构建**: `npm run build`
