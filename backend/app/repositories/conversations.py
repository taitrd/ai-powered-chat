"""Data access functions for conversations."""

import base64
import binascii
import uuid
from datetime import datetime

from sqlalchemy import delete as sql_delete
from sqlalchemy import func, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Conversation

DEFAULT_TITLE = "New Chat"


def encode_cursor(conversation: Conversation) -> str:
    raw = f"{conversation.updated_at.isoformat()}|{conversation.id}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        updated_at, conversation_id = base64.urlsafe_b64decode(cursor.encode()).decode().split("|")
        return datetime.fromisoformat(updated_at), uuid.UUID(conversation_id)
    except (binascii.Error, UnicodeDecodeError, ValueError) as exc:
        raise ValueError("Invalid cursor format") from exc


async def get_owned(
    session: AsyncSession, user_id: uuid.UUID, conversation_id: uuid.UUID
) -> Conversation | None:
    """Fetch conversation only if owned by user_id."""
    return await session.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id, Conversation.user_id == user_id
        )
    )


async def list_page(
    session: AsyncSession,
    user_id: uuid.UUID,
    limit: int = 20,
    cursor: str | None = None,
) -> tuple[list[Conversation], str | None]:
    """List paginated conversations for a user, newest first."""
    query = (
        select(Conversation)
        .where(Conversation.user_id == user_id)
        .order_by(Conversation.updated_at.desc(), Conversation.id.desc())
        .limit(limit + 1)
    )
    if cursor:
        updated_at, conversation_id = decode_cursor(cursor)
        query = query.where(
            tuple_(Conversation.updated_at, Conversation.id) < (updated_at, conversation_id)
        )
    rows = list(await session.scalars(query))
    has_more = len(rows) > limit
    items = rows[:limit]
    next_cursor = encode_cursor(items[-1]) if has_more and items else None
    return items, next_cursor


async def create(
    session: AsyncSession, user_id: uuid.UUID, title: str | None = None
) -> Conversation:
    """Create a new conversation for a user."""
    conversation = Conversation(user_id=user_id, title=title or DEFAULT_TITLE)
    session.add(conversation)
    await session.commit()
    await session.refresh(conversation)
    return conversation


async def rename(
    session: AsyncSession, conversation: Conversation, title: str
) -> Conversation:
    """Rename a conversation and touch updated_at."""
    conversation.title = title
    conversation.updated_at = func.now()
    await session.commit()
    await session.refresh(conversation)
    return conversation


async def delete(
    session: AsyncSession, user_id: uuid.UUID, conversation_id: uuid.UUID
) -> bool:
    """Delete a conversation if owned by user_id. Returns True if deleted."""
    result = await session.execute(
        sql_delete(Conversation).where(
            Conversation.id == conversation_id, Conversation.user_id == user_id
        )
    )
    if result.rowcount == 0:
        return False
    await session.commit()
    return True
