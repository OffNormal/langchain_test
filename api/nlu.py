"""
FastAPI NLU 服务 — LangChain + DeepSeek
启动: .venv/bin/python -m uvicorn api.nlu:app --port 8000
需要: export DEEPSEEK_API_KEY=sk-xxx
"""

from pydantic import BaseModel
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from langchain_deepseek import ChatDeepSeek

app = FastAPI(title="Voice Drawing NLU")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# 引入讯飞 ASR 鉴权路由
from api.iflytek_auth import router as iflytek_router
app.include_router(iflytek_router)


# ── Schema ──
class NLURequest(BaseModel):
    text: str


class NLUSlots(BaseModel):
    shape_type: str | None = None
    radius: float | None = None
    width: float | None = None
    height: float | None = None
    fill_color: str | None = None
    stroke_color: str | None = None
    stroke_width: float | None = None
    position: dict | None = None
    target_ref: str | None = None
    property: str | None = None
    value: str | float | None = None
    zoom_level: float | None = None
    pan_direction: str | None = None
    pan_distance: float | None = None
    file_action: str | None = None
    format: str | None = None
    filename: str | None = None


class NLUResult(BaseModel):
    intent: str
    confidence: float
    slots: NLUSlots


SYSTEM_PROMPT = """你是绘图指令解析器。将用户语音转写解析为结构化指令。

意图类型: CREATE_SHAPE / MODIFY_OBJECT / DELETE_OBJECT / NAVIGATE / FILE_OPERATION / QUERY。
图形类型: circle(圆) / rect(矩形) / triangle(三角形) / line(直线) / arrow(箭头)。
颜色映射: 红=#EF4444, 橙=#F97316, 黄=#EAB308, 绿=#22C55E, 蓝=#3B82F6, 紫=#A855F7, 粉=#EC4899, 黑=#000000, 白=#FFFFFF, 灰=#6B7280。
默认值: 圆半径100, 矩形200x150, 画布中心为center。
指令约定: 撤销/不对→file_action=undo, 重做→file_action=redo, 保存→file_action=save, 导出→file_action=export format=png, 清空→file_action=new, 放大→zoom_level=1.5, 缩小→zoom_level=0.67。
输出格式: {"intent": "...", "confidence": 0.9, "slots": {...}}"""

# 懒加载: 首次请求时才初始化（需要 DEEPSEEK_API_KEY）
_chain = None


def get_chain():
    global _chain
    if _chain is None:
        llm = ChatDeepSeek(model="deepseek-chat", temperature=0.1)
        _chain = (
            ChatPromptTemplate.from_messages([
                ("system", SYSTEM_PROMPT),
                ("user", "{user_input}"),
            ])
            | llm
            | JsonOutputParser(pydantic_object=NLUResult)
        )
    return _chain


@app.post("/api/nlu")
async def nlu(req: NLURequest) -> NLUResult:
    return get_chain().invoke({"user_input": req.text})


@app.get("/api/health")
async def health():
    return {"status": "ok"}
