"""Database engine and per-request sessions.

NullPool opens a connection for each request and closes it afterwards. On AWS this
lets Aurora pause when idle (see PLAN.md, Section 6), and locally the overhead is small.
"""

import asyncio
import time
from collections.abc import AsyncIterator
from functools import lru_cache

import asyncpg
import boto3
from fastapi import HTTPException, status
from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.core.config import get_settings

_token_cache: dict[str, tuple[str, float]] = {}


def get_cached_iam_token(host: str, port: int, user: str, region: str) -> str:
    """Generate or retrieve a cached RDS IAM authentication token (10 min cache)."""
    key = f"{host}:{port}:{user}:{region}"
    now = time.time()
    cached = _token_cache.get(key)
    if cached and (now - cached[1]) < 600:
        return cached[0]

    client = boto3.client("rds", region_name=region)
    token = client.generate_db_auth_token(
        DBHostname=host,
        Port=port,
        DBUsername=user,
        Region=region,
    )
    _token_cache[key] = (token, now)
    return token


@lru_cache
def get_engine() -> AsyncEngine:
    settings = get_settings()
    connect_args = {}
    if (
        "rds.amazonaws.com" in settings.database_url
        or "ssl=" in settings.database_url
        or settings.app_env == "prod"
    ):
        connect_args["ssl"] = "require"

    engine = create_async_engine(
        settings.database_url, poolclass=NullPool, connect_args=connect_args
    )

    if settings.db_auth_mode == "iam":

        @event.listens_for(engine.sync_engine, "do_connect")
        def _provide_iam_token(dialect, conn_rec, cargs, cparams):
            host = cparams.get("host") or "localhost"
            port = int(cparams.get("port") or 5432)
            user = cparams.get("user") or "app"
            cparams["password"] = get_cached_iam_token(
                host=host, port=port, user=user, region=settings.aws_region
            )
            cparams["ssl"] = "require"

    return engine


@lru_cache
def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(get_engine(), expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    settings = get_settings()
    if settings.db_auth_mode != "iam":
        async with get_sessionmaker()() as session:
            yield session
        return

    # In IAM / Aurora mode: retry while Aurora resumes from pause
    start_time = time.monotonic()
    max_wait = 45.0
    delay = 1.0

    while True:
        try:
            async with get_sessionmaker()() as session:
                await session.connection()
                yield session
                break
        except (OSError, asyncpg.PostgresError) as exc:
            elapsed = time.monotonic() - start_time
            if elapsed >= max_wait:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Database is resuming from pause, please retry in a few seconds.",
                    headers={"Retry-After": "15"},
                ) from exc
            await asyncio.sleep(min(delay, max_wait - elapsed))
            delay = min(delay * 1.5, 5.0)
