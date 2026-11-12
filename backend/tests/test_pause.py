"""Daily pause: friendly 503 for chat API calls, while the site and status stay available."""

import datetime as dt

import pytest

from app.core import pause
from app.core.config import get_settings
from tests.conftest import as_user

pytestmark = pytest.mark.anyio


@pytest.fixture
def paused(monkeypatch):
    """Simulates the awake guard having set the SSM switch to "true"."""
    monkeypatch.setattr(get_settings(), "pause_parameter_name", "/chat-app/test/paused")
    monkeypatch.setattr(pause, "_read_parameter", lambda name: True)
    pause.reset_cache()
    yield
    pause.reset_cache()


async def test_status_is_not_paused_by_default(client):
    response = await client.get("/api/v1/status")
    assert response.status_code == 200
    assert response.json() == {"paused": False, "resumes_at": None, "message": None}


async def test_status_reports_pause_and_resume_time(client, paused):
    body = (await client.get("/api/v1/status")).json()
    assert body["paused"] is True
    assert "daily limit" in body["message"]
    resume = dt.datetime.fromisoformat(body["resumes_at"])
    assert resume.hour == 0 and resume.minute == 0 and resume > dt.datetime.now(dt.UTC)


async def test_chat_api_is_refused_with_friendly_503_before_database_access(client, paused):
    response = await client.get("/api/v1/conversations", headers=as_user("alice"))
    assert response.status_code == 503
    body = response.json()
    assert body["code"] == "daily_limit"
    assert "back at midnight UTC" in body["detail"]
    assert int(response.headers["Retry-After"]) >= 60


async def test_models_and_health_still_work_while_paused(client, paused):
    assert (await client.get("/api/v1/models")).status_code == 200
    assert (await client.get("/healthz")).status_code == 200


async def test_ssm_errors_never_block_the_app(client, monkeypatch):
    def broken(name):
        raise RuntimeError("SSM unavailable")

    monkeypatch.setattr(get_settings(), "pause_parameter_name", "/chat-app/test/paused")
    monkeypatch.setattr(pause, "_read_parameter", broken)
    pause.reset_cache()
    try:
        response = await client.get("/api/v1/conversations", headers=as_user("alice"))
        assert response.status_code == 200
    finally:
        pause.reset_cache()


def test_resume_time_is_next_midnight_utc():
    now = dt.datetime(2026, 11, 12, 13, 59, tzinfo=dt.UTC)
    assert pause.resumes_at(now) == dt.datetime(2026, 11, 13, tzinfo=dt.UTC)
    assert pause.seconds_until_resume(now) == 10 * 3600 + 60
