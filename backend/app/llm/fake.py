"""Fake LLM provider for offline development and testing."""

import asyncio
from collections.abc import AsyncIterator

from app.llm.base import (
    AuthFailed,
    ChatMessage,
    LLMError,
    RateLimited,
    Refused,
    StreamEnd,
    TextDelta,
    Unavailable,
)


class FakeProvider:
    """A deterministic test provider that yields tokens with a configurable delay."""

    def __init__(
        self,
        *,
        chunks: list[str] | None = None,
        delay: float = 0.0,
        fail_with: str | None = None,
        model_name: str = "fake-model",
    ) -> None:
        self.chunks = chunks if chunks is not None else [
            "This ", "is ", "a ", "test ", "reply ", "from ", "the ", "fake ", "provider."
        ]
        self.delay = delay
        self.fail_with = fail_with
        self.model_name = model_name

    async def stream(
        self,
        messages: list[ChatMessage],
        *,
        system: str | None = None,
        max_tokens: int = 4000,
    ) -> AsyncIterator[TextDelta | StreamEnd]:
        if self.fail_with == "rate_limited":
            raise RateLimited("Fake rate limit exceeded")
        elif self.fail_with == "auth_failed":
            raise AuthFailed("Fake invalid API key")
        elif self.fail_with == "refused":
            raise Refused("Fake model refused the prompt")
        elif self.fail_with == "unavailable":
            raise Unavailable("Fake service unavailable")
        elif self.fail_with:
            raise LLMError(f"Fake error: {self.fail_with}")

        for chunk in self.chunks:
            if self.delay > 0:
                await asyncio.sleep(self.delay)
            yield TextDelta(delta=chunk)

        yield StreamEnd(stop_reason="end_turn")
