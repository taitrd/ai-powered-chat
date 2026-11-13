"""Conversation schemas."""

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints, computed_field

from app.core.config import get_settings

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class ConversationCreate(BaseModel):
    title: Title | None = None


class ConversationUpdate(BaseModel):
    title: Title


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    provider_id: str | None
    message_count: int
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def messages_left(self) -> int:
        return max(get_settings().max_messages_per_conversation - self.message_count, 0)


class ConversationPage(BaseModel):
    items: list[ConversationOut]
    next_cursor: str | None
