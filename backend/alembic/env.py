"""Alembic migration environment (async)."""

import asyncio
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import event
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import get_settings
from app.db.models import Base
from app.db.session import get_cached_iam_token

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def database_url() -> str:
    # Explicit URL (from tests or environment) wins over default settings.
    return (
        config.get_main_option("sqlalchemy.url")
        or os.environ.get("DATABASE_URL")
        or get_settings().database_url
    )


def run_migrations_offline() -> None:
    context.configure(url=database_url(), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    settings = get_settings()
    if settings.db_driver == "dataapi":
        # Through the RDS Data API (HTTPS), the same engine the app uses.
        from app.db.session import get_engine

        async with get_engine().connect() as connection:
            await connection.run_sync(do_run_migrations)
            await connection.commit()
        return

    url = database_url()
    connect_args = {}
    if "rds.amazonaws.com" in url or "ssl=" in url or settings.app_env == "prod":
        connect_args["ssl"] = "require"

    engine = create_async_engine(url, poolclass=NullPool, connect_args=connect_args)
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

    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
