"""Tests for database engine, IAM authentication, and session handling."""

from unittest.mock import MagicMock, patch

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


@pytest.mark.anyio
async def test_iam_session_retry_timeout(monkeypatch):
    from unittest.mock import AsyncMock

    from app.core.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "db_auth_mode", "iam")

    # Mock sessionmaker to fail with OSError on connection
    mock_session = AsyncMock()
    mock_session.connection.side_effect = OSError("Connection refused")
    mock_ctx = AsyncMock()
    mock_ctx.__aenter__.return_value = mock_session
    mock_ctx.__aexit__.return_value = None

    with patch("app.db.session.get_sessionmaker", return_value=lambda: mock_ctx):
        with patch("app.db.session.time.monotonic", side_effect=[0.0, 50.0]):
            with pytest.raises(HTTPException) as exc_info:
                async for _ in get_session():
                    pass
            assert exc_info.value.status_code == 503
            assert "Retry-After" in exc_info.value.headers
