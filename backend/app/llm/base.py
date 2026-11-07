"""Base definitions, protocol, events, and shared exceptions for AI providers."""

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class ChatMessage:
    role: str
    content: str


@dataclass(frozen=True)
class TextDelta:
    delta: str


@dataclass(frozen=True)
class StreamEnd:
    stop_reason: str | None = None


# --- Shared Exceptions ---


class LLMError(Exception):
    """Base exception for all LLM errors."""


class RateLimited(LLMError):
    """Provider rate limit or quota exceeded."""


class AuthFailed(LLMError):
    """Authentication or API key error."""


class Refused(LLMError):
    """Model refused to answer the prompt."""


class Unavailable(LLMError):
    """Provider is temporarily unreachable or service unavailable."""


# --- Provider Protocol ---


class LLMProvider(Protocol):
    """Standard interface implemented by every provider adapter."""

    def stream(
        self,
        messages: list[ChatMessage],
        *,
        system: str | None = None,
        max_tokens: int = 4000,
    ) -> AsyncIterator[TextDelta | StreamEnd]:
        """Stream response tokens one by one."""
        ...
