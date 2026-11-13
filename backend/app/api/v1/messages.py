"""Message streaming routes."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas.messages import MessageCreate
from app.core.security import get_current_user
from app.db.models import User
from app.db.session import get_session
from app.repositories import conversations as conversations_repo
from app.services.chat import prepare_user_turn, stream_chat_reply
from app.services.limits import (
    ConversationFullError,
    InvalidMessageLengthError,
    LimitExceededError,
)

router = APIRouter(prefix="/conversations", tags=["messages"])


@router.post("/{conversation_id}/messages")
async def send_message(
    conversation_id: uuid.UUID,
    body: MessageCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    """Send a user message, persist it, and stream the AI assistant reply via SSE."""
    # 1. Verify ownership (returns 404 for missing or other user's data)
    conversation = await conversations_repo.get_owned(session, user.id, conversation_id)
    if conversation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")

    # 2. Validate limits and prepare message & context
    try:
        user_message, chat_context = await prepare_user_turn(
            session=session,
            conversation=conversation,
            raw_content=body.content,
            provider_id=body.provider_id,
        )
    except InvalidMessageLengthError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    except ConversationFullError as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={"code": "conversation_full", "message": str(exc)},
        ) from exc
    except LimitExceededError as exc:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, str(exc)) from exc

    # 3. Release database connection before starting the long-lived SSE stream
    await session.close()

    provider_id_to_use = body.provider_id or conversation.provider_id

    # 4. Stream reply
    return StreamingResponse(
        stream_chat_reply(
            conversation_id=conversation_id,
            chat_context=chat_context,
            provider_id=provider_id_to_use,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
