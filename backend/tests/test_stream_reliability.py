"""Replies must not disappear when the provider is slow or returns nothing."""

import json

import httpx
import pytest

from app.llm.base import StreamEnd
from app.llm.fake import FakeProvider
from app.services import chat as chat_service
from tests.conftest import as_user

pytestmark = pytest.mark.anyio

ALICE = as_user("alice")


class SingleProviderRegistry:
    """Stands in for the provider registry with one fixed provider."""

    def __init__(self, provider) -> None:
        self.provider = provider

    def get_provider(self, provider_id=None):
        return self.provider, "fake", "fake-model"

    async def stream_with_fallback(
        self, messages, *, provider_id=None, system=None, max_tokens=4000
    ):
        async for event in self.provider.stream(messages, system=system, max_tokens=max_tokens):
            yield event, "fake", "fake-model"


class EmptyReplyProvider:
    """Finishes without any text, like a reply whose whole budget went to thinking."""

    async def stream(self, messages, *, system=None, max_tokens=4000):
        yield StreamEnd(stop_reason="length")


async def send_and_read(client: httpx.AsyncClient, content: str) -> tuple[str, list[str]]:
    conversation = (await client.post("/api/v1/conversations", json={}, headers=ALICE)).json()
    lines: list[str] = []
    async with client.stream(
        "POST",
        f"/api/v1/conversations/{conversation['id']}/messages",
        json={"content": content},
        headers=ALICE,
    ) as response:
        assert response.status_code == 200
        async for line in response.aiter_lines():
            if line:
                lines.append(line)
    return conversation["id"], lines


def deltas(lines: list[str]) -> str:
    text = ""
    for line in lines:
        if line.startswith("data: {"):
            text += json.loads(line[6:]).get("delta", "")
    return text


async def saved_messages(client: httpx.AsyncClient, conversation_id: str) -> list[dict]:
    response = await client.get(f"/api/v1/conversations/{conversation_id}/messages", headers=ALICE)
    return response.json()["items"]


async def test_slow_provider_reply_is_not_cut_off_by_heartbeat(client, monkeypatch):
    # Each token takes longer than the heartbeat interval, as with a slow or thinking model.
    monkeypatch.setattr(chat_service, "HEARTBEAT_SECONDS", 0.05)
    slow = FakeProvider(chunks=["Slow ", "but ", "complete."], delay=0.2)
    monkeypatch.setattr(chat_service, "get_registry", lambda: SingleProviderRegistry(slow))

    conversation_id, lines = await send_and_read(client, "Hello")

    assert ": ping" in lines, "heartbeats should be sent while waiting"
    assert deltas(lines) == "Slow but complete."
    assert lines[-1] == "data: [DONE]"
    messages = await saved_messages(client, conversation_id)
    assert [m["role"] for m in messages] == ["user", "assistant"]
    assert messages[1]["content"] == "Slow but complete."


async def test_empty_reply_is_reported_as_an_error(client, monkeypatch):
    monkeypatch.setattr(
        chat_service, "get_registry", lambda: SingleProviderRegistry(EmptyReplyProvider())
    )

    conversation_id, lines = await send_and_read(client, "Hello")

    assert "data: [DONE]" not in lines
    assert "event: error" in lines
    error = json.loads(lines[lines.index("event: error") + 1][6:])["error"]
    assert "empty reply" in error.lower()
    messages = await saved_messages(client, conversation_id)
    assert [m["role"] for m in messages] == ["user"], "no empty assistant message is saved"
