"""Tests for LLM adapters and registry."""

import pytest

from app.llm.base import (
    ChatMessage,
    RateLimited,
    Refused,
    StreamEnd,
    TextDelta,
)
from app.llm.fake import FakeProvider
from app.llm.registry import ProviderRegistry


@pytest.mark.anyio
async def test_fake_provider_streaming():
    provider = FakeProvider(chunks=["Hello", " world"])
    messages = [ChatMessage(role="user", content="Hi")]
    events = []
    async for event in provider.stream(messages):
        events.append(event)

    assert len(events) == 3
    assert events[0] == TextDelta(delta="Hello")
    assert events[1] == TextDelta(delta=" world")
    assert events[2] == StreamEnd(stop_reason="end_turn")


@pytest.mark.anyio
async def test_fake_provider_error_simulation():
    provider = FakeProvider(fail_with="rate_limited")
    with pytest.raises(RateLimited):
        async for _ in provider.stream([ChatMessage(role="user", content="Hi")]):
            pass

    provider_refused = FakeProvider(fail_with="refused")
    with pytest.raises(Refused):
        async for _ in provider_refused.stream([ChatMessage(role="user", content="Hi")]):
            pass


def test_registry_active_providers():
    registry = ProviderRegistry()
    active = registry.get_active_providers()
    assert len(active) >= 1
    assert any(p.id == "fake" for p in active)


@pytest.mark.anyio
async def test_registry_stream_with_fallback(monkeypatch):
    registry = ProviderRegistry()

    # Configure a primary that fails and fallback that succeeds
    class FailingProvider:
        async def stream(self, messages, *, system=None, max_tokens=4000):
            raise RateLimited("Quota exhausted")
            yield  # make it an async generator

    def mock_instantiate(provider_id, model):
        if provider_id == "gemini":
            return FailingProvider()
        return FakeProvider(chunks=["Fallback", " worked"])

    monkeypatch.setattr(registry, "_instantiate_provider", mock_instantiate)
    monkeypatch.setattr(
        registry,
        "get_active_providers",
        lambda: [
            type("Info", (), {"id": "gemini", "model": "gemini-3.5-flash", "label": "Gemini"}),
            type("Info", (), {"id": "fake", "model": "fake-model", "label": "Fake"}),
        ],
    )

    from app.core.config import get_settings
    settings = get_settings()
    monkeypatch.setattr(settings, "llm_fallbacks", "fake")

    messages = [ChatMessage(role="user", content="Test fallback")]
    events = []
    async for item in registry.stream_with_fallback(messages, provider_id="gemini"):
        events.append(item)

    assert len(events) == 3
    event0, pid0, _ = events[0]
    assert isinstance(event0, TextDelta)
    assert event0.delta == "Fallback"
    assert pid0 == "fake"
