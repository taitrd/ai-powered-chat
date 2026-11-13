"""Data access functions for messages."""

import base64
import binascii
import uuid
from datetime import datetime

from sqlalchemy import delete as sql_delete
from sqlalchemy import func, select, tuple_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Conversation, Message


def encode_cursor(message: Message) -> str:
    raw = f"{message.created_at.isoformat()}|{message.id}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        created_at, message_id = base64.urlsafe_b64decode(cursor.encode()).decode().split("|")
        return datetime.fromisoformat(created_at), uuid.UUID(message_id)
    except (binascii.Error, UnicodeDecodeError, ValueError) as exc:
        raise ValueError("Invalid cursor format") from exc


async def list_page(
    session: AsyncSession,
    conversation_id: uuid.UUID,
    limit: int = 25,
    before: str | None = None,
) -> tuple[list[Message], str | None]:
    """One page of messages, newest page first; each page is oldest-first.

    `next_cursor` fetches the next older page. Uses the (conversation_id, created_at, id) index.
    """
    query = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc(), Message.id.desc())
        .limit(limit + 1)
    )
    if before:
        created_at, message_id = decode_cursor(before)
        query = query.where(tuple_(Message.created_at, Message.id) < (created_at, message_id))
    rows = list(await session.scalars(query))
    has_more = len(rows) > limit
    page = rows[:limit]
    next_cursor = encode_cursor(page[-1]) if has_more and page else None
    return list(reversed(page)), next_cursor


async def delete_all(session: AsyncSession, conversation_id: uuid.UUID) -> None:
    """Delete every message of a conversation and reset its counter, in one transaction."""
    await session.execute(sql_delete(Message).where(Message.conversation_id == conversation_id))
    await session.execute(
        update(Conversation)
        .where(Conversation.id == conversation_id)
        .values(message_count=0, updated_at=func.now())
    )
    await session.commit()


async def get_recent_history(
    session: AsyncSession, conversation_id: uuid.UUID, limit: int = 40
) -> list[Message]:
    """Retrieve the most recent N messages in chronological order for AI context."""
    rows = await session.scalars(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc(), Message.id.desc())
        .limit(limit)
    )
    # Reverse to chronological order
    return list(reversed(list(rows)))


async def add_message(
    session: AsyncSession,
    conversation_id: uuid.UUID,
    role: str,
    content: str,
    provider: str | None = None,
    model: str | None = None,
) -> Message:
    """Insert and return a message."""
    message = Message(
        conversation_id=conversation_id,
        role=role,
        content=content,
        provider=provider,
        model=model,
    )
    session.add(message)
    await session.commit()
    await session.refresh(message)
    return message
