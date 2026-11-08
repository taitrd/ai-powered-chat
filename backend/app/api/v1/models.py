"""AI Models endpoints."""

from fastapi import APIRouter

from app.api.v1.schemas.models import ProviderOut
from app.llm.registry import get_registry

router = APIRouter(prefix="/models", tags=["models"])


@router.get("", response_model=list[ProviderOut])
async def list_models() -> list[ProviderOut]:
    """List active AI providers. Never touches DB to avoid waking Aurora."""
    registry = get_registry()
    active = registry.get_active_providers()
    return [ProviderOut(id=p.id, label=p.label, model=p.model) for p in active]
