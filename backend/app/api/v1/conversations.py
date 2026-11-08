"""Conversation routes."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas.conversations import (
    ConversationCreate,
    ConversationOut,
    ConversationPage,
    ConversationUpdate,
)
from app.api.v1.schemas.messages import MessageOut
from app.core.security import get_current_user
from app.db.models import Conversation, Message, User
from app.db.session import get_session
from app.repositories import conversations as conversations_repo
from app.repositories import messages as messages_repo

router = APIRouter(prefix="/conversations", tags=["conversations"])


async def get_owned_conversation(
    session: AsyncSession, user: User, conversation_id: uuid.UUID
) -> Conversation:
    conversation = await conversations_repo.get_owned(session, user.id, conversation_id)
    if conversation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    return conversation


@router.post("", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    body: ConversationCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Conversation:
    return await conversations_repo.create(session, user.id, body.title)


@router.get("", response_model=ConversationPage)
async def list_conversations(
    limit: int = Query(20, ge=1, le=100),
    cursor: str | None = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ConversationPage:
    try:
        items, next_cursor = await conversations_repo.list_page(
            session, user.id, limit=limit, cursor=cursor
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid cursor") from exc

    return ConversationPage(
        items=[ConversationOut.model_validate(c) for c in items],
        next_cursor=next_cursor,
    )


@router.get("/{conversation_id}", response_model=ConversationOut)
async def get_conversation(
    conversation_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Conversation:
    return await get_owned_conversation(session, user, conversation_id)


@router.patch("/{conversation_id}", response_model=ConversationOut)
async def rename_conversation(
    conversation_id: uuid.UUID,
    body: ConversationUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Conversation:
    conversation = await get_owned_conversation(session, user, conversation_id)
    return await conversations_repo.rename(session, conversation, body.title)


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    deleted = await conversations_repo.delete(session, user.id, conversation_id)
    if not deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{conversation_id}/messages", response_model=list[MessageOut])
async def list_messages(
    conversation_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[Message]:
    await get_owned_conversation(session, user, conversation_id)
    return await messages_repo.list_for_conversation(session, conversation_id)
