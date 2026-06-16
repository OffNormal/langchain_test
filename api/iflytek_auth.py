"""
iFlytek IAT Auth — 生成带签名的 WebSocket URL
讯飞流式语音转写 API 需要 HMAC-SHA256 签名，API Secret 必须保留在服务端

讯飞 IAT API 文档: https://www.xfyun.cn/doc/asr/voicedictation/API.html
"""

import os
import base64
import hmac
import hashlib
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/iflytek", tags=["iflytek"])

# 讯飞 IAT 默认 host
IFLYTEK_IAT_HOST = os.getenv("IFLYTEK_IAT_HOST", "iat-api.xfyun.cn")
IFLYTEK_IAT_PATH = "/v2/iat"
IFLYTEK_APP_ID = os.getenv("IFLYTEK_APP_ID", "")
IFLYTEK_API_KEY = os.getenv("IFLYTEK_API_KEY", "")
IFLYTEK_API_SECRET = os.getenv("IFLYTEK_API_SECRET", "")


def _rfc1123_date() -> str:
    """生成 RFC 1123 格式的 UTC 时间，讯飞签名要求"""
    return datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S GMT")


def _build_signature(host: str, date: str) -> str:
    """构造 HMAC-SHA256 签名"""
    signature_origin = f"host: {host}\ndate: {date}\nGET {IFLYTEK_IAT_PATH} HTTP/1.1"
    signature_sha = hmac.new(
        IFLYTEK_API_SECRET.encode("utf-8"),
        signature_origin.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).digest()
    return base64.b64encode(signature_sha).decode("utf-8")


def _build_authorization(api_key: str, signature: str) -> str:
    """构造 authorization 参数值"""
    auth_origin = (
        f'api_key="{api_key}", algorithm="hmac-sha256", '
        f'headers="host date request-line", signature="{signature}"'
    )
    return base64.b64encode(auth_origin.encode("utf-8")).decode("utf-8")


@router.get("/auth")
async def get_auth_url():
    """
    生成带签名的讯飞 IAT WebSocket URL。
    前端调用此接口获取 URL，然后直接连接 WebSocket。
    API Secret 不离开服务端。
    """
    if not all([IFLYTEK_APP_ID, IFLYTEK_API_KEY, IFLYTEK_API_SECRET]):
        raise HTTPException(
            status_code=500,
            detail="讯飞 ASR 未配置: 请设置 IFLYTEK_APP_ID / IFLYTEK_API_KEY / IFLYTEK_API_SECRET 环境变量",
        )

    date = _rfc1123_date()
    signature = _build_signature(IFLYTEK_IAT_HOST, date)
    authorization = _build_authorization(IFLYTEK_API_KEY, signature)

    ws_url = (
        f"wss://{IFLYTEK_IAT_HOST}{IFLYTEK_IAT_PATH}"
        f"?authorization={authorization}"
        f"&date={date}"
        f"&host={IFLYTEK_IAT_HOST}"
    )

    return {
        "url": ws_url,
        "app_id": IFLYTEK_APP_ID,
    }
