"""Provider registry: loads definitions, activates based on credentials, and provides fallbacks."""

from collections.abc import AsyncIterator
from dataclasses import dataclass
from pathlib import Path
import yaml

from app.core.config import get_settings
from app.llm.base import (
    ChatMessage,
    LLMProvider,
    RateLimited,
    StreamEnd,
    TextDelta,
    Unavailable,
)

PROVIDERS_FILE = Path(__file__).parent / "providers.yaml"


@dataclass(frozen=True)
class ProviderInfo:
    id: str
    label: str
    model: str


def _load_config() -> list[dict]:
    if not PROVIDERS_FILE.exists():
        return []
    with open(PROVIDERS_FILE, encoding="utf-8") as f:
        return yaml.safe_load(f) or []


class ProviderRegistry:
    def __init__(self) -> None:
        self._raw_configs = _load_config()

    def get_active_providers(self) -> list[ProviderInfo]:
        settings = get_settings()
        active: list[ProviderInfo] = []

        for item in self._raw_configs:
            pid = item["id"]
            if pid == "fake":
                # Fake is available locally, during test, or when explicitly chosen as default
                if settings.app_env in ("local", "test") or settings.llm_default == "fake":
                    active.append(
                        ProviderInfo(
                            id=pid,
                            label=item.get("label", "Fake"),
                            model=item.get("default_model", "fake-model"),
                        )
                    )
            elif pid == "gemini":
                api_key = getattr(settings, item.get("api_key_env", "").lower(), "")
                if api_key:
                    model = getattr(settings, item.get("model_env", "").lower(), "") or item.get(
                        "default_model", "gemini-2.0-flash"
                    )
                    active.append(
                        ProviderInfo(id=pid, label=item.get("label", "Gemini"), model=model)
                    )
            elif pid == "openai":
                api_key = getattr(settings, item.get("api_key_env", "").lower(), "")
                if api_key:
                    model = getattr(settings, item.get("model_env", "").lower(), "") or item.get(
                        "default_model", "gpt-4o-mini"
                    )
                    active.append(
                        ProviderInfo(id=pid, label=item.get("label", "ChatGPT"), model=model)
                    )
            elif pid == "claude":
                if settings.bedrock_enabled:
                    model = getattr(settings, item.get("model_env", "").lower(), "") or item.get(
                        "default_model", "anthropic.claude-haiku-5-5"
                    )
                    active.append(
                        ProviderInfo(id=pid, label=item.get("label", "Claude"), model=model)
                    )

        # Fallback to fake if nothing else is active to guarantee the app operates locally
        if not active and settings.app_env in ("local", "test"):
            active.append(ProviderInfo(id="fake", label="Fake (Local)", model="fake-model"))

        return active

    def get_provider(
        self, provider_id: str | None = None
    ) -> tuple[LLMProvider, str, str]:
        """Returns (provider_instance, provider_id, model_name)."""
        settings = get_settings()
        active = {p.id: p for p in self.get_active_providers()}

        target_id = provider_id or settings.llm_default
        if target_id not in active:
            # If specified provider is unavailable, fallback to default or first active
            if settings.llm_default in active:
                target_id = settings.llm_default
            elif active:
                target_id = next(iter(active.keys()))
            else:
                raise Unavailable("No active AI providers available")

        info = active[target_id]
        instance = self._instantiate_provider(target_id, info.model)
        return instance, target_id, info.model

    def _instantiate_provider(self, provider_id: str, model: str) -> LLMProvider:
        settings = get_settings()
        config_map = {item["id"]: item for item in self._raw_configs}
        cfg = config_map.get(provider_id, {})
        adapter = cfg.get("adapter", "fake")

        if adapter == "fake":
            from app.llm.fake import FakeProvider

            return FakeProvider(model_name=model)
        elif adapter == "openai_compatible":
            from app.llm.openai_compatible import OpenAICompatibleProvider

            api_key = getattr(settings, cfg.get("api_key_env", "").lower(), "")
            base_url = cfg.get("base_url", "https://api.openai.com/v1")
            return OpenAICompatibleProvider(api_key=api_key, base_url=base_url, model=model)
        elif adapter == "bedrock":
            try:
                from app.llm.bedrock import BedrockProvider
            except ImportError as exc:
                raise Unavailable(f"Bedrock dependencies not installed: {exc}") from exc
            return BedrockProvider(model_id=model, region_name=settings.aws_region)
        else:
            raise Unavailable(f"Unknown adapter: {adapter}")

    async def stream_with_fallback(
        self,
        messages: list[ChatMessage],
        *,
        provider_id: str | None = None,
        system: str | None = None,
        max_tokens: int = 4000,
    ) -> AsyncIterator[tuple[TextDelta | StreamEnd, str, str]]:
        """Streams with fallback before the first token.

        Yields (event, provider_id, model_name).
        """
        settings = get_settings()
        provider_inst, active_pid, model = self.get_provider(provider_id)

        # Prepare candidate chain (primary, then configured fallbacks)
        candidate_ids = [active_pid]
        if settings.llm_fallbacks:
            for fb in settings.llm_fallbacks.split(","):
                fb = fb.strip()
                if fb and fb not in candidate_ids:
                    candidate_ids.append(fb)

        token_yielded = False
        last_error: Exception | None = None

        for candidate_id in candidate_ids:
            try:
                candidate_inst, pid, p_model = self.get_provider(candidate_id)
            except Unavailable as exc:
                last_error = exc
                continue

            try:
                async for event in candidate_inst.stream(
                    messages, system=system, max_tokens=max_tokens
                ):
                    token_yielded = True
                    yield event, pid, p_model
                # Successful completion
                return
            except (RateLimited, Unavailable) as exc:
                last_error = exc
                # Only retry next provider if zero tokens have been yielded
                if token_yielded:
                    raise
                continue

        if last_error:
            raise last_error
        raise Unavailable("All configured LLM providers failed")


_registry = ProviderRegistry()


def get_registry() -> ProviderRegistry:
    return _registry
