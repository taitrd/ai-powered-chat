"""Test fixtures: a real PostgreSQL test database, migrated with Alembic."""

import asyncio
import os
from pathlib import Path

# Point the app at the test database before any app module reads settings.
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+asyncpg://chat:chat@localhost:5432/chat_test"
)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["APP_ENV"] = "test"
os.environ["AUTH_MODE"] = "local"
os.environ["DB_AUTH_MODE"] = "password"

import httpx  # noqa: E402
import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

from app.db.session import get_sessionmaker  # noqa: E402
from app.main import app  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parents[1]


# DB_DRIVER=dataapi runs the suite through the RDS Data API: against the fake
# (DATA_API_FAKE_DSN) or a real Aurora scratch database (DATA_API_DATABASE).
USE_DATA_API = os.environ.get("DB_DRIVER") == "dataapi"
if USE_DATA_API and not os.environ.get("DATA_API_FAKE_DSN"):
    # The setup below drops the whole schema. Never point it at the real app database.
    assert (
        os.environ.get("DATA_API_DATABASE", "chat") != "chat"
    ), "Set DATA_API_DATABASE to a scratch database: tests wipe the schema"


async def _reset_schema() -> None:
    if USE_DATA_API:
        from app.db.session import get_engine

        engine = get_engine()
    else:
        engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
    if not USE_DATA_API:
        await engine.dispose()


@pytest.fixture(scope="session", autouse=True)
def migrated_database() -> None:
    """Start from an empty schema and apply every migration once per test run."""
    asyncio.run(_reset_schema())
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    if not USE_DATA_API:
        config.set_main_option("sqlalchemy.url", TEST_DATABASE_URL)
    command.upgrade(config, "head")


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture(autouse=True)
async def clean_tables(anyio_backend: str) -> None:
    async with get_sessionmaker()() as session:
        await session.execute(text("TRUNCATE users, conversations, messages CASCADE"))
        await session.commit()


@pytest.fixture
async def client(anyio_backend: str) -> httpx.AsyncClient:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


def as_user(name: str) -> dict[str, str]:
    """Headers that make a request as a local development user."""
    return {"X-Dev-User": name}
