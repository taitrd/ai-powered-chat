"""Daily limits and message validation business rules."""

import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.repositories import messages as messages_repo


class LimitExceededError(Exception):
    """Raised when a daily message limit is reached."""


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


async def check_daily_limits(session: AsyncSession, user_id: uuid.UUID) -> None:
    """Check both per-user and global daily message limits for the current UTC day."""
    settings = get_settings()
    now_utc = datetime.now(UTC)
    today_midnight = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)

    user_count = await messages_repo.count_user_messages_since(session, user_id, today_midnight)
    if user_count >= settings.daily_user_message_limit:
        raise LimitExceededError(
            f"Daily user limit reached ({settings.daily_user_message_limit} messages/day)"
        )

    global_count = await messages_repo.count_global_messages_since(session, today_midnight)
    if global_count >= settings.daily_global_message_limit:
        raise LimitExceededError(
            "Daily demo capacity reached across all users. Please try again tomorrow."
        )
