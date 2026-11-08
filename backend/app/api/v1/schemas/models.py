"""AI Model schemas."""

from pydantic import BaseModel


class ProviderOut(BaseModel):
    id: str
    label: str
    model: str
