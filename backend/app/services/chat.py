"""Chat orchestrator service: handles message preparation, auto-titling, and streaming."""

import asyncio
import json
import uuid
from collections.abc import AsyncIterator

from sqlalchemy import func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.models import Conversation, Message
from app.db.session import get_sessionmaker
from app.llm.base import ChatMessage, LLMError, RateLimited, StreamEnd, TextDelta, Unavailable
from app.llm.registry import get_registry
from app.repositories import conversations as conversations_repo
from app.repositories import messages as messages_repo
from app.services.limits import (
    ConversationFullError,
    LimitExceededError,
    record_daily_usage,
    validate_message_length,
)

# Send an SSE comment when the provider is quiet this long, so proxies keep the stream open.
HEARTBEAT_SECONDS = 15.0


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

    # 2. Reserve room for this question and its reply, then count it against the daily limits.
    #    Both are single statements in the same transaction as the message itself.
    settings = get_settings()
    new_count = await conversations_repo.reserve_slots(
        session, conversation.id, settings.max_messages_per_conversation
    )
    if new_count is None:
        await session.rollback()
        raise ConversationFullError(
            f"This chat is full ({settings.max_messages_per_conversation} messages). "
            "Start a new chat or clear this one."
        )
    try:
        await record_daily_usage(session, conversation.user_id)
    except LimitExceededError:
        await session.rollback()
        raise

    # 3. Add user message
    effective_pid = provider_id or conversation.provider_id or get_settings().llm_default
    model_name = None
    try:
        registry = get_registry()
        _, resolved_pid, resolved_model = registry.get_provider(effective_pid)
        effective_pid = resolved_pid
        model_name = resolved_model
    except Exception:
        pass

    user_msg = Message(
        conversation_id=conversation.id,
        role="user",
        content=clean_content,
        provider=effective_pid,
        model=model_name,
    )
    session.add(user_msg)

    # 4. Auto-title if default
    if conversation.title == "New Chat":
        conversation.title = generate_title(clean_content)

    if provider_id or not conversation.provider_id:
        conversation.provider_id = effective_pid

    await session.commit()
    await session.refresh(conversation)

    # 5. Load context messages (up to 40)
    history = await messages_repo.get_recent_history(session, conversation.id, limit=40)
    chat_context = [ChatMessage(role=m.role, content=m.content) for m in history]

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
    stop_reason: str | None = None

    stream_iter = registry.stream_with_fallback(
        chat_context,
        provider_id=provider_id,
        max_tokens=settings.max_output_tokens,
    ).__aiter__()

    async def next_event():
        return await stream_iter.__anext__()

    # One read is in flight at a time. On a heartbeat timeout we keep waiting on the
    # same read: cancelling it (as asyncio.wait_for does) would end the provider's
    # stream and silently drop the rest of the reply.
    pending: asyncio.Task | None = None

    try:
        while True:
            if pending is None:
                pending = asyncio.ensure_future(next_event())
            done, _ = await asyncio.wait({pending}, timeout=HEARTBEAT_SECONDS)
            if not done:
                yield ": ping\n\n"  # Heartbeat comment keeps proxies from closing the stream.
                continue

            finished, pending = pending, None
            try:
                event, pid, model = finished.result()
            except StopAsyncIteration:
                break

            final_pid = pid
            final_model = model

            if isinstance(event, TextDelta):
                full_reply_chunks.append(event.delta)
                data = json.dumps({"delta": event.delta})
                yield f"data: {data}\n\n"
            elif isinstance(event, StreamEnd):
                stop_reason = event.stop_reason or "end_turn"
                data = json.dumps({"stop_reason": stop_reason})
                yield f"data: {data}\n\n"

        full_text = "".join(full_reply_chunks)
        if not full_text:
            # Finishing without text (for example, the whole token budget went to thinking,
            # or the provider returned nothing) must not look like success to the user.
            raise LLMError(
                f"The AI provider returned an empty reply (stop reason: {stop_reason or 'none'}). "
                "Please try again."
            )

        # Save assistant message before sending [DONE]
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
                new_count = await save_session.scalar(
                    update(Conversation)
                    .where(Conversation.id == conversation_id)
                    .values(
                        message_count=Conversation.message_count + 1, updated_at=func.now()
                    )
                    .returning(Conversation.message_count)
                )
                await save_session.commit()
            if new_count is not None:
                left = max(settings.max_messages_per_conversation - new_count, 0)
                counts = json.dumps({"message_count": new_count, "messages_left": left})
                yield f"data: {counts}\n\n"

        yield "data: [DONE]\n\n"

    except (RateLimited, Unavailable, LLMError, Exception) as exc:
        err_data = json.dumps({"error": str(exc)})
        yield f"event: error\ndata: {err_data}\n\n"
    finally:
        # Client disconnected or an error occurred: stop the in-flight provider read.
        if pending is not None and not pending.done():
            pending.cancel()
        aclose = getattr(stream_iter, "aclose", None)
        if aclose is not None:
            try:
                await aclose()
            except Exception:
                pass
