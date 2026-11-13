"""Message schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MessageCreate(BaseModel):
    content: str
    provider_id: str | None = None


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role: str
    content: str
    provider: str | None
    model: str | None
    created_at: datetime


class MessagePage(BaseModel):
    """One page of messages, oldest first. `next_cursor` fetches the next older page."""

    items: list[MessageOut]
    next_cursor: str | None
