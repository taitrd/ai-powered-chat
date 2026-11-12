"""Daily pause switch, set by the awake guard Lambda when Aurora's daily awake cap is reached.

The switch is an SSM parameter ("true" or "false"). While paused, the app still serves
the website and cached chats, but chat API calls get a friendly 503 before any database
access, so Aurora can pause and the daily cost stays capped. The value is cached briefly
so each request doesn't call SSM.
"""

import asyncio
import datetime as dt
import logging
import time

from app.core.config import get_settings

logger = logging.getLogger(__name__)

CACHE_SECONDS = 60.0
DAILY_LIMIT_CODE = "daily_limit"
PAUSED_MESSAGE = (
    "The demo has reached its daily limit and will be back at midnight UTC. "
    "Your saved chats are still here."
)

_cache: tuple[float, bool] | None = None


def resumes_at(now: dt.datetime | None = None) -> dt.datetime:
    """The pause ends at the next midnight UTC, when the guard resets the daily budget."""
    now = now or dt.datetime.now(dt.UTC)
    return (now + dt.timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)


def seconds_until_resume(now: dt.datetime | None = None) -> int:
    now = now or dt.datetime.now(dt.UTC)
    return max(int((resumes_at(now) - now).total_seconds()), 60)


def _read_parameter(name: str) -> bool:
    import boto3

    region = get_settings().aws_region
    value = boto3.client("ssm", region_name=region).get_parameter(Name=name)["Parameter"]["Value"]
    return value.strip().lower() == "true"


async def is_paused() -> bool:
    """Whether the daily cap is reached. Fails open: an SSM error never blocks the app."""
    global _cache
    name = get_settings().pause_parameter_name
    if not name:
        return False
    now = time.monotonic()
    if _cache and now - _cache[0] < CACHE_SECONDS:
        return _cache[1]
    try:
        paused = await asyncio.to_thread(_read_parameter, name)
    except Exception:  # noqa: BLE001  Availability over strictness for a cost switch.
        logger.exception("Could not read the pause switch %s; treating as not paused", name)
        paused = False
    _cache = (now, paused)
    return paused


def reset_cache() -> None:
    global _cache
    _cache = None
