"""Chat orchestrator service: handles message preparation, auto-titling, and streaming."""

import asyncio
import json
import uuid
from collections.abc import AsyncIterator

from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.models import Conversation, Message
from app.db.session import get_sessionmaker
from app.llm.base import ChatMessage, LLMError, RateLimited, StreamEnd, TextDelta, Unavailable
from app.llm.registry import get_registry
from app.repositories import messages as messages_repo
from app.services.limits import check_daily_limits, validate_message_length


def generate_title(content: str) -> str:
    """Generate conversation title from the first message (up to 60 chars)."""
    trimmed = content.strip()
    if len(trimmed) <= 60:
        return trimmed
    return f"{trimmed[:57]}..."


async def prepare_user_turn(
    session: AsyncSession,
    conversation: Conversation,
    raw_content: str,
    provider_id: str | None = None,
) -> tuple[Message, list[ChatMessage]]:
    """Validate limits, save user message, update auto-title, and return context."""
    # 1. Validate length
    clean_content = validate_message_length(raw_content)

    # 2. Check limits
    await check_daily_limits(session, conversation.user_id)

    # 3. Add user message
    user_msg = Message(
        conversation_id=conversation.id,
        role="user",
        content=clean_content,
    )
    session.add(user_msg)

    # 4. Auto-title if default
    if conversation.title == "New Chat":
        conversation.title = generate_title(clean_content)

    conversation.updated_at = func.now()
    if provider_id:
        conversation.provider_id = provider_id

    await session.commit()

    # 5. Load context messages (up to 40)
    history = await messages_repo.get_recent_history(session, conversation.id, limit=40)
    chat_context = [
        ChatMessage(role=m.role, content=m.content)
        for m in history
    ]

    return user_msg, chat_context


async def stream_chat_reply(
    conversation_id: uuid.UUID,
    chat_context: list[ChatMessage],
    provider_id: str | None = None,
) -> AsyncIterator[str]:
    """Async generator streaming SSE chunks to the client and saving before [DONE]."""
    settings = get_settings()
    registry = get_registry()

    full_reply_chunks: list[str] = []
    final_pid: str | None = None
    final_model: str | None = None

    try:
        stream_iter = registry.stream_with_fallback(
            chat_context,
            provider_id=provider_id,
            max_tokens=settings.max_output_tokens,
        ).__aiter__()

        while True:
            try:
                item = await asyncio.wait_for(stream_iter.__anext__(), timeout=15.0)
            except TimeoutError:
                # Heartbeat comment to keep connections alive
                yield ": ping\n\n"
                continue
            except StopAsyncIteration:
                break

            event, pid, model = item
            final_pid = pid
            final_model = model

            if isinstance(event, TextDelta):
                full_reply_chunks.append(event.delta)
                data = json.dumps({"delta": event.delta})
                yield f"data: {data}\n\n"
            elif isinstance(event, StreamEnd):
                data = json.dumps({"stop_reason": event.stop_reason or "end_turn"})
                yield f"data: {data}\n\n"

        # Save assistant message before sending [DONE]
        full_text = "".join(full_reply_chunks)
        if full_text:
            async with get_sessionmaker()() as save_session:
                asst_msg = Message(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=full_text,
                    provider=final_pid,
                    model=final_model,
                )
                save_session.add(asst_msg)
                conv = await save_session.get(Conversation, conversation_id)
                if conv:
                    conv.updated_at = func.now()
                await save_session.commit()

        yield "data: [DONE]\n\n"

    except (RateLimited, Unavailable, LLMError, Exception) as exc:
        err_data = json.dumps({"error": str(exc)})
        yield f"event: error\ndata: {err_data}\n\n"
