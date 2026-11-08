"""Data access functions for messages."""

import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Conversation, Message


async def list_for_conversation(
    session: AsyncSession, conversation_id: uuid.UUID
) -> list[Message]:
    """Retrieve all messages for a conversation in chronological order."""
    rows = await session.scalars(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at, Message.id)
    )
    return list(rows)


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


async def count_user_messages_since(
    session: AsyncSession, user_id: uuid.UUID, since: datetime
) -> int:
    """Count user messages sent by user_id since a given timestamp."""
    count = await session.scalar(
        select(func.count(Message.id))
        .join(Conversation)
        .where(
            Conversation.user_id == user_id,
            Message.role == "user",
            Message.created_at >= since,
        )
    )
    return count or 0


async def count_global_messages_since(
    session: AsyncSession, since: datetime
) -> int:
    """Count user messages sent globally across all users since a given timestamp."""
    count = await session.scalar(
        select(func.count(Message.id)).where(
            Message.role == "user",
            Message.created_at >= since,
        )
    )
    return count or 0
