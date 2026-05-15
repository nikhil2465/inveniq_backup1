import json
import logging
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
from app.services.orchestrator import process_query, process_query_stream

logger = logging.getLogger(__name__)

router = APIRouter(tags=["AI Assistant"])


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    mode: str = "ask"   # ask | explain | act
    history: Optional[List[Message]] = []


class ChatResponse(BaseModel):
    response: str
    mode: str
    tools_used: Optional[List[str]] = []
    rca_performed: bool = False


# ── Non-streaming endpoint (fallback) ─────────────────────────────────────────
@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    if not req.message or not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if req.mode not in ("ask", "explain", "act"):
        raise HTTPException(status_code=400, detail="Mode must be ask, explain, or act")

    result = await process_query(
        query=req.message.strip(),
        mode=req.mode,
        history=[m.model_dump() for m in (req.history or [])],
    )
    return ChatResponse(**result)


# ── Streaming SSE endpoint ─────────────────────────────────────────────────────
@router.post("/chat/stream")
async def chat_stream(req: ChatRequest, request: Request):
    if not req.message or not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if req.mode not in ("ask", "explain", "act"):
        raise HTTPException(status_code=400, detail="Mode must be ask, explain, or act")

    history = [m.model_dump() for m in (req.history or [])]

    async def event_generator():
        try:
            async for event in process_query_stream(
                query=req.message.strip(),
                mode=req.mode,
                history=history,
            ):
                if await request.is_disconnected():
                    break
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except Exception as exc:
            logger.error("SSE stream error: %s", exc, exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        },
    )
