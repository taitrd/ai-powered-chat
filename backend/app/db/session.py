"""Database engine and per-request sessions.

Two ways to reach PostgreSQL:
- Direct (asyncpg): local Docker with a password, or Aurora with short-lived IAM tokens.
- RDS Data API (DB_DRIVER=dataapi): SQL over HTTPS, see app/db/dataapi.

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

IAM_TOKEN_TTL_SECONDS = 600  # Tokens are valid for 15 minutes; refresh well before.
RESUME_MAX_WAIT_SECONDS = 45.0  # How long to wait for a paused Aurora to accept connections.

_token_cache: dict[str, tuple[str, float]] = {}


def get_cached_iam_token(host: str, port: int, user: str, region: str) -> str:
    """Generate or retrieve a cached RDS IAM authentication token (10 min cache)."""
    key = f"{host}:{port}:{user}:{region}"
    now = time.time()
    cached = _token_cache.get(key)
    if cached and (now - cached[1]) < IAM_TOKEN_TTL_SECONDS:
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


def _data_api_engine() -> AsyncEngine:
    """Engine that sends SQL through the RDS Data API (see app/db/dataapi)."""
    import app.db.dataapi  # noqa: F401  Registers the postgresql+dataapi dialect.

    settings = get_settings()
    if settings.data_api_fake_dsn:
        from app.db.dataapi.fake import FakeDataApiClient

        client = FakeDataApiClient(settings.data_api_fake_dsn)
    else:
        from app.db.dataapi.client import BotoDataApiClient

        client = BotoDataApiClient(
            resource_arn=settings.data_api_resource_arn,
            secret_arn=settings.data_api_secret_arn,
            database=settings.data_api_database,
            region=settings.aws_region,
        )
    return create_async_engine("postgresql+dataapi://", connect_args={"client": client})


def _needs_ssl(url: str) -> bool:
    return "rds.amazonaws.com" in url or "ssl=" in url or get_settings().app_env == "prod"


def create_direct_engine(url: str) -> AsyncEngine:
    """Engine for a direct asyncpg connection. Used by the app and by Alembic migrations.

    With DB_AUTH_MODE=iam, each new connection signs in with a cached IAM token over TLS.
    """
    settings = get_settings()
    connect_args = {"ssl": "require"} if _needs_ssl(url) else {}
    engine = create_async_engine(url, poolclass=NullPool, connect_args=connect_args)

    if settings.db_auth_mode == "iam":

        @event.listens_for(engine.sync_engine, "do_connect")
        def _provide_iam_token(dialect, conn_rec, cargs, cparams):
            cparams["password"] = get_cached_iam_token(
                host=cparams.get("host") or "localhost",
                port=int(cparams.get("port") or 5432),
                user=cparams.get("user") or "app",
                region=settings.aws_region,
            )
            cparams["ssl"] = "require"

    return engine


@lru_cache
def get_engine() -> AsyncEngine:
    settings = get_settings()
    if settings.db_driver == "dataapi":
        return _data_api_engine()
    return create_direct_engine(settings.database_url)


@lru_cache
def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(get_engine(), expire_on_commit=False)


async def _connect_while_resuming(session: AsyncSession) -> None:
    """Opens the session's connection, retrying while a paused Aurora resumes.

    Only the connect step is retried: errors raised later by the request itself are
    never mistaken for a sleeping database.
    """
    started, delay = time.monotonic(), 1.0
    while True:
        try:
            await session.connection()
            return
        except (OSError, asyncpg.PostgresError) as exc:
            elapsed = time.monotonic() - started
            if elapsed >= RESUME_MAX_WAIT_SECONDS:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Database is resuming from pause, please retry in a few seconds.",
                    headers={"Retry-After": "15"},
                ) from exc
            await session.close()  # Discard the failed attempt before trying again.
            await asyncio.sleep(min(delay, RESUME_MAX_WAIT_SECONDS - elapsed))
            delay = min(delay * 1.5, 5.0)


async def get_session() -> AsyncIterator[AsyncSession]:
    """One session per request. With IAM (direct Aurora), waits for a paused cluster.

    The Data API driver retries resuming clusters itself (app/db/dataapi/dialect.py).
    """
    settings = get_settings()
    async with get_sessionmaker()() as session:
        if settings.db_driver == "asyncpg" and settings.db_auth_mode == "iam":
            await _connect_while_resuming(session)
        yield session
