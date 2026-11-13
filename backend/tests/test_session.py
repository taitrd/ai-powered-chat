"""Tests for database engine, IAM authentication, and session handling."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.db.session import (
    _token_cache,
    get_cached_iam_token,
    get_engine,
    get_session,
)


def test_iam_token_caching():
    _token_cache.clear()
    with patch("boto3.client") as mock_boto:
        mock_rds = MagicMock()
        mock_rds.generate_db_auth_token.return_value = "token_xyz"
        mock_boto.return_value = mock_rds

        token1 = get_cached_iam_token("db.host", 5432, "app", "us-east-1")
        assert token1 == "token_xyz"
        assert mock_rds.generate_db_auth_token.call_count == 1

        # Second call within 10 minutes hits cache
        token2 = get_cached_iam_token("db.host", 5432, "app", "us-east-1")
        assert token2 == "token_xyz"
        assert mock_rds.generate_db_auth_token.call_count == 1


def test_iam_engine_listener(monkeypatch):
    from app.core.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "db_auth_mode", "iam")
    get_engine.cache_clear()

    with patch("boto3.client") as mock_boto:
        mock_rds = MagicMock()
        mock_rds.generate_db_auth_token.return_value = "token_iam_123"
        mock_boto.return_value = mock_rds

        engine = get_engine()
        cparams = {"host": "aurora.example.com", "port": 5432, "user": "app"}
        # Fire do_connect listener on dialect dispatch
        engine.sync_engine.dialect.dispatch.do_connect(
            engine.sync_engine.dialect, None, [], cparams
        )

        assert cparams["password"] == "token_iam_123"
        assert cparams["ssl"] == "require"

    get_engine.cache_clear()


class FakeSession:
    """Stands in for AsyncSession: fails to connect a given number of times."""

    def __init__(self, failures: int = 0) -> None:
        self.failures = failures
        self.connect_attempts = 0
        self.closed = 0

    async def connection(self):
        self.connect_attempts += 1
        if self.connect_attempts <= self.failures:
            raise OSError("Connection refused")

    async def close(self):
        self.closed += 1

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        await self.close()


@pytest.fixture
def iam_mode(monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "db_auth_mode", "iam")
    monkeypatch.setattr(get_settings(), "db_driver", "asyncpg")
    monkeypatch.setattr("app.db.session.asyncio.sleep", AsyncMock())


@pytest.mark.anyio
async def test_iam_session_waits_while_aurora_resumes(iam_mode):
    session = FakeSession(failures=2)
    with patch("app.db.session.get_sessionmaker", return_value=lambda: session):
        async for yielded in get_session():
            assert yielded is session
    assert session.connect_attempts == 3


@pytest.mark.anyio
async def test_iam_session_gives_503_after_max_wait(iam_mode):
    session = FakeSession(failures=99)
    with patch("app.db.session.get_sessionmaker", return_value=lambda: session):
        with patch("app.db.session.time.monotonic", side_effect=[0.0, 50.0]):
            with pytest.raises(HTTPException) as exc_info:
                async for _ in get_session():
                    pass
    assert exc_info.value.status_code == 503
    assert "Retry-After" in exc_info.value.headers


@pytest.mark.anyio
async def test_errors_inside_the_request_are_not_retried(iam_mode):
    # Regression: the retry used to wrap the yield, so a network error raised by the
    # request itself (e.g. a reset connection to an AI provider) looked like a sleeping
    # database: it was swallowed and the generator tried to yield a second time.
    session = FakeSession()
    with patch("app.db.session.get_sessionmaker", return_value=lambda: session):
        sessions = get_session()
        await sessions.__anext__()
        with pytest.raises(ConnectionResetError, match="upstream reset"):
            await sessions.athrow(ConnectionResetError("upstream reset"))
    assert session.connect_attempts == 1
