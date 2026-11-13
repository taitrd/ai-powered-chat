"""Daily limits and message validation business rules."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.models import DailyUsage


class LimitExceededError(Exception):
    """Raised when a daily message limit is reached."""


class ConversationFullError(Exception):
    """Raised when a conversation has no room for another question and its reply."""


class InvalidMessageLengthError(Exception):
    """Raised when a message is empty or exceeds character limits."""


def validate_message_length(content: str, max_chars: int | None = None) -> str:
    """Validate and strip message content, enforcing character limits."""
    settings = get_settings()
    limit = max_chars if max_chars is not None else settings.max_message_chars
    stripped = content.strip()
    if not stripped or len(stripped) > limit:
        raise InvalidMessageLengthError(
            f"Message length must be between 1 and {limit} characters"
        )
    return stripped


async def record_daily_usage(session: AsyncSession, user_id: uuid.UUID) -> None:
    """Count one message for today and enforce the per-user and global daily limits.

    Two cheap reads of counter rows replace COUNTs over the messages table. The caller owns
    the transaction and must roll back on LimitExceededError so a refused message is not counted.
    """
    settings = get_settings()
    today = datetime.now(UTC).date()

    user_total = await session.scalar(
        insert(DailyUsage)
        .values(day=today, user_id=user_id, messages=1)
        .on_conflict_do_update(
            index_elements=[DailyUsage.day, DailyUsage.user_id],
            set_={"messages": DailyUsage.messages + 1},
        )
        .returning(DailyUsage.messages)
    )
    if user_total > settings.daily_user_message_limit:
        raise LimitExceededError(
            f"Daily user limit reached ({settings.daily_user_message_limit} messages/day)"
        )

    global_total = await session.scalar(
        select(func.coalesce(func.sum(DailyUsage.messages), 0)).where(DailyUsage.day == today)
    )
    if global_total > settings.daily_global_message_limit:
        raise LimitExceededError(
            "Daily demo capacity reached across all users. Please try again tomorrow."
        )
