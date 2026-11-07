"""OpenAI-compatible adapter for Gemini and OpenAI endpoints."""

from collections.abc import AsyncIterator
import openai
from openai import AsyncOpenAI

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


class OpenAICompatibleProvider:
    """Streams responses from OpenAI or any OpenAI-compatible API (e.g. Google Gemini)."""

    def __init__(
        self,
        api_key: str,
        base_url: str,
        model: str,
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url
        self.model = model
        self.client = AsyncOpenAI(api_key=api_key, base_url=base_url)

    async def stream(
        self,
        messages: list[ChatMessage],
        *,
        system: str | None = None,
        max_tokens: int = 4000,
    ) -> AsyncIterator[TextDelta | StreamEnd]:
        formatted_messages: list[dict[str, str]] = []
        if system:
            formatted_messages.append({"role": "system", "content": system})
        for msg in messages:
            formatted_messages.append({"role": msg.role, "content": msg.content})

        try:
            stream = await self.client.chat.completions.create(
                model=self.model,
                messages=formatted_messages,
                max_tokens=max_tokens,
                stream=True,
            )
        except openai.RateLimitError as exc:
            raise RateLimited(f"Rate limit exceeded: {exc}") from exc
        except openai.AuthenticationError as exc:
            raise AuthFailed(f"Authentication failed: {exc}") from exc
        except openai.APIConnectionError as exc:
            raise Unavailable(f"Connection failed: {exc}") from exc
        except openai.APIStatusError as exc:
            if exc.status_code >= 500:
                raise Unavailable(f"Service unavailable ({exc.status_code}): {exc}") from exc
            raise LLMError(f"API status error ({exc.status_code}): {exc}") from exc
        except Exception as exc:
            raise LLMError(f"Unexpected error: {exc}") from exc

        finish_seen = False
        try:
            async for chunk in stream:
                if not chunk.choices:
                    continue
                choice = chunk.choices[0]
                content = choice.delta.content or ""
                if content:
                    yield TextDelta(delta=content)

                if choice.finish_reason:
                    finish_seen = True
                    if choice.finish_reason == "content_filter":
                        raise Refused("Content filter triggered by provider")
                    yield StreamEnd(stop_reason=choice.finish_reason)
                    return
        except openai.RateLimitError as exc:
            raise RateLimited(f"Rate limit exceeded mid-stream: {exc}") from exc
        except openai.APIConnectionError as exc:
            raise Unavailable(f"Connection dropped mid-stream: {exc}") from exc
        except Exception as exc:
            if isinstance(exc, (Refused, RateLimited, Unavailable)):
                raise
            raise LLMError(f"Error during streaming: {exc}") from exc

        if not finish_seen:
            yield StreamEnd(stop_reason="end_turn")
