"""Database engine and per-request sessions.

NullPool opens a connection for each request and closes it afterwards. On AWS this
lets Aurora pause when idle (see PLAN.md, Section 6), and locally the overhead is small.
"""

from collections.abc import AsyncIterator
from functools import lru_cache

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.core.config import get_settings


@lru_cache
def get_engine() -> AsyncEngine:
    settings = get_settings()
    if settings.db_auth_mode == "iam":
        # Added in milestone M5 together with the Aurora express cluster.
        raise NotImplementedError("DB_AUTH_MODE=iam is not implemented yet")
    return create_async_engine(settings.database_url, poolclass=NullPool)


@lru_cache
def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(get_engine(), expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with get_sessionmaker()() as session:
        yield session
