"""Application settings, read from environment variables."""

from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")

    app_env: Literal["local", "test", "prod"] = "local"
    auth_mode: Literal["local", "cognito"] = "local"

    database_url: str = "postgresql+asyncpg://chat:chat@localhost:5432/chat"
    db_auth_mode: Literal["password", "iam"] = "password"

    cognito_user_pool_id: str = ""
    cognito_client_id: str = ""
    aws_region: str = "us-east-1"

    max_message_chars: int = 4000
    max_output_tokens: int = 8000
    daily_user_message_limit: int = 30
    daily_global_message_limit: int = 200

    @model_validator(mode="after")
    def _check_safe_combination(self) -> "Settings":
        if self.app_env == "prod" and self.auth_mode == "local":
            raise ValueError("AUTH_MODE=local is not allowed when APP_ENV=prod")
        if self.auth_mode == "cognito" and not (
            self.cognito_user_pool_id and self.cognito_client_id
        ):
            raise ValueError(
                "AUTH_MODE=cognito requires COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID"
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
