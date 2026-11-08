"""AWS Bedrock ConverseStream adapter for Claude models."""

from collections.abc import AsyncIterator

import anyio
import boto3
from botocore.exceptions import ClientError

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


class BedrockProvider:
    """Streams responses from Amazon Bedrock using the ConverseStream API."""

    def __init__(self, model_id: str, region_name: str = "us-east-1") -> None:
        self.model_id = model_id
        self.region_name = region_name
        self._client = boto3.client("bedrock-runtime", region_name=region_name)

    async def stream(
        self,
        messages: list[ChatMessage],
        *,
        system: str | None = None,
        max_tokens: int = 4000,
    ) -> AsyncIterator[TextDelta | StreamEnd]:
        formatted_messages = [
            {"role": msg.role, "content": [{"text": msg.content}]}
            for msg in messages
        ]
        system_prompts = [{"text": system}] if system else []

        def _call_converse_stream():
            kwargs = {
                "modelId": self.model_id,
                "messages": formatted_messages,
                "inferenceConfig": {"maxTokens": max_tokens},
            }
            if system_prompts:
                kwargs["system"] = system_prompts
            return self._client.converse_stream(**kwargs)

        try:
            response = await anyio.to_thread.run_sync(_call_converse_stream)
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code in ("ThrottlingException", "RequestLimitExceeded"):
                raise RateLimited(f"Bedrock throttled: {exc}") from exc
            elif code in ("AccessDeniedException", "UnrecognizedClientException"):
                raise AuthFailed(f"Bedrock authorization failed: {exc}") from exc
            elif code in ("ServiceUnavailableException", "InternalServerException"):
                raise Unavailable(f"Bedrock service unavailable: {exc}") from exc
            raise LLMError(f"Bedrock API error ({code}): {exc}") from exc
        except Exception as exc:
            raise LLMError(f"Bedrock client error: {exc}") from exc

        stream_body = response.get("stream")
        if not stream_body:
            yield StreamEnd(stop_reason="end_turn")
            return

        def _get_next_event(iterator):
            try:
                return next(iterator)
            except StopIteration:
                return None

        event_iter = iter(stream_body)
        while True:
            event = await anyio.to_thread.run_sync(_get_next_event, event_iter)
            if event is None:
                break

            if "contentBlockDelta" in event:
                delta = event["contentBlockDelta"].get("delta", {})
                if "text" in delta:
                    yield TextDelta(delta=delta["text"])
            elif "messageStop" in event:
                stop_reason = event["messageStop"].get("stopReason")
                if stop_reason == "refusal":
                    raise Refused("Claude refused to answer the prompt")
                yield StreamEnd(stop_reason=stop_reason)
                return

        yield StreamEnd(stop_reason="end_turn")
