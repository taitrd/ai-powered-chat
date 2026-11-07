"""Conversation, message, and AI streaming endpoints.

Every query is filtered by the current user. Another user's conversation returns 404,
so its existence isn't revealed.
"""

import asyncio
import base64
import binascii
from datetime import datetime, timezone
import json
import uuid
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, func, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas import (
    ConversationCreate,
    ConversationOut,
    ConversationPage,
    ConversationUpdate,
    MessageCreate,
    MessageOut,
    ProviderOut,
)
from app.core.config import get_settings
from app.core.security import get_current_user
from app.db.models import Conversation, Message, User
from app.db.session import get_session, get_sessionmaker
from app.llm.base import ChatMessage, LLMError, RateLimited, StreamEnd, TextDelta, Unavailable
from app.llm.registry import get_registry

router = APIRouter(prefix="/conversations", tags=["conversations"])
models_router = APIRouter(prefix="/models", tags=["models"])

DEFAULT_TITLE = "New Chat"


def _encode_cursor(conversation: Conversation) -> str:
    raw = f"{conversation.updated_at.isoformat()}|{conversation.id}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        updated_at, conversation_id = base64.urlsafe_b64decode(cursor.encode()).decode().split("|")
        return datetime.fromisoformat(updated_at), uuid.UUID(conversation_id)
    except (binascii.Error, UnicodeDecodeError, ValueError) as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid cursor") from exc


async def _get_owned_conversation(
    session: AsyncSession, user: User, conversation_id: uuid.UUID
) -> Conversation:
    conversation = await session.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id, Conversation.user_id == user.id
        )
    )
    if conversation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    return conversation


@router.post("", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    body: ConversationCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Conversation:
    conversation = Conversation(user_id=user.id, title=body.title or DEFAULT_TITLE)
    session.add(conversation)
    await session.commit()
    await session.refresh(conversation)
    return conversation


@router.get("", response_model=ConversationPage)
async def list_conversations(
    limit: int = Query(20, ge=1, le=100),
    cursor: str | None = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ConversationPage:
    query = (
        select(Conversation)
        .where(Conversation.user_id == user.id)
        .order_by(Conversation.updated_at.desc(), Conversation.id.desc())
        .limit(limit + 1)
    )
    if cursor:
        updated_at, conversation_id = _decode_cursor(cursor)
        query = query.where(
            tuple_(Conversation.updated_at, Conversation.id) < (updated_at, conversation_id)
        )
    rows = list(await session.scalars(query))
    has_more = len(rows) > limit
    items = rows[:limit]
    return ConversationPage(
        items=[ConversationOut.model_validate(c) for c in items],
        next_cursor=_encode_cursor(items[-1]) if has_more else None,
    )


@router.get("/{conversation_id}", response_model=ConversationOut)
async def get_conversation(
    conversation_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Conversation:
    return await _get_owned_conversation(session, user, conversation_id)


@router.patch("/{conversation_id}", response_model=ConversationOut)
async def rename_conversation(
    conversation_id: uuid.UUID,
    body: ConversationUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Conversation:
    conversation = await _get_owned_conversation(session, user, conversation_id)
    conversation.title = body.title
    conversation.updated_at = func.now()
    await session.commit()
    await session.refresh(conversation)
    return conversation


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    result = await session.execute(
        delete(Conversation).where(
            Conversation.id == conversation_id, Conversation.user_id == user.id
        )
    )
    if result.rowcount == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{conversation_id}/messages", response_model=list[MessageOut])
async def list_messages(
    conversation_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[Message]:
    await _get_owned_conversation(session, user, conversation_id)
    rows = await session.scalars(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at, Message.id)
    )
    return list(rows)


@models_router.get("", response_model=list[ProviderOut])
async def list_models() -> list[ProviderOut]:
    """List active AI providers. Never touches DB to avoid waking Aurora."""
    registry = get_registry()
    active = registry.get_active_providers()
    return [ProviderOut(id=p.id, label=p.label, model=p.model) for p in active]


@router.post("/{conversation_id}/messages")
async def send_message(
    conversation_id: uuid.UUID,
    body: MessageCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    """Send a user message, persist it, and stream the AI assistant reply via SSE."""
    settings = get_settings()

    # 1. Validate content length
    stripped_content = body.content.strip()
    if not stripped_content or len(stripped_content) > settings.max_message_chars:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Message length must be between 1 and {settings.max_message_chars} characters",
        )

    # 2. Check conversation ownership
    conversation = await _get_owned_conversation(session, user, conversation_id)

    # 3. Check daily limits (UTC day)
    now_utc = datetime.now(timezone.utc)
    today_midnight = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)

    user_count = await session.scalar(
        select(func.count(Message.id))
        .join(Conversation)
        .where(
            Conversation.user_id == user.id,
            Message.role == "user",
            Message.created_at >= today_midnight,
        )
    )
    if (user_count or 0) >= settings.daily_user_message_limit:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Daily user limit reached ({settings.daily_user_message_limit} messages/day)",
        )

    global_count = await session.scalar(
        select(func.count(Message.id)).where(
            Message.role == "user",
            Message.created_at >= today_midnight,
        )
    )
    if (global_count or 0) >= settings.daily_global_message_limit:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Daily demo capacity reached across all users. Please try again tomorrow.",
        )

    # 4. Save user message & auto-generate title if default
    user_message = Message(
        conversation_id=conversation_id,
        role="user",
        content=stripped_content,
    )
    session.add(user_message)

    if conversation.title == DEFAULT_TITLE:
        conversation.title = (
            stripped_content[:60] if len(stripped_content) <= 60 else stripped_content[:57] + "..."
        )
    conversation.updated_at = func.now()
    if body.provider_id:
        conversation.provider_id = body.provider_id

    await session.commit()

    # 5. Load recent history (up to 40 messages) for prompt context
    history_rows = await session.scalars(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc(), Message.id.desc())
        .limit(40)
    )
    chat_context = [
        ChatMessage(role=m.role, content=m.content)
        for m in reversed(list(history_rows))
    ]

    # Close current DB session before starting long-lived LLM stream
    await session.close()

    registry = get_registry()
    provider_id_to_use = body.provider_id or conversation.provider_id

    async def event_generator() -> AsyncIterator[str]:
        full_reply_chunks: list[str] = []
        final_pid: str | None = None
        final_model: str | None = None

        try:
            stream_iter = registry.stream_with_fallback(
                chat_context,
                provider_id=provider_id_to_use,
                max_tokens=settings.max_output_tokens,
            ).__aiter__()

            while True:
                try:
                    item = await asyncio.wait_for(stream_iter.__anext__(), timeout=15.0)
                except asyncio.TimeoutError:
                    # Heartbeat comment to keep CloudFront connection alive
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

            # 6. Save assistant reply in a fresh session BEFORE sending [DONE]
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

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
