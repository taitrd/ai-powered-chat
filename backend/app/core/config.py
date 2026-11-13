"""Application settings, read from environment variables."""

from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        extra="ignore",
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
    )

    app_env: Literal["local", "test", "prod"] = "local"
    auth_mode: Literal["local", "cognito"] = "local"

    database_url: str = "postgresql+asyncpg://chat:chat@localhost:5432/chat"
    db_auth_mode: Literal["password", "iam"] = "password"

    # "asyncpg" connects directly. "dataapi" uses the RDS Data API over HTTPS (proof of
    # concept), so Aurora can stay in private subnets with no public IP.
    db_driver: Literal["asyncpg", "dataapi"] = "asyncpg"
    data_api_resource_arn: str = ""  # Aurora cluster ARN
    data_api_secret_arn: str = ""  # Secrets Manager ARN of the database user
    data_api_database: str = "chat"
    # Tests and local checks only: emulate the Data API against this PostgreSQL DSN.
    data_api_fake_dsn: str = ""

    # SSM parameter set to "true" by the awake guard when the daily cap is reached.
    pause_parameter_name: str = ""

    cognito_user_pool_id: str = ""
    cognito_client_id: str = ""
    aws_region: str = "us-east-1"

    llm_default: str = "fake"
    llm_fallbacks: str = ""
    gemini_api_key: str = ""
    gemini_model: str = ""
    openai_api_key: str = ""
    openai_model: str = ""
    bedrock_enabled: bool = False
    bedrock_model_id: str = "anthropic.claude-haiku-5-5"

    max_message_chars: int = 4000
    max_output_tokens: int = 8000
    daily_user_message_limit: int = 30
    daily_global_message_limit: int = 200
    max_messages_per_conversation: int = 100
    message_page_size: int = 25

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
        if self.db_driver == "dataapi" and not self.data_api_fake_dsn:
            if not (self.data_api_resource_arn and self.data_api_secret_arn):
                raise ValueError(
                    "DB_DRIVER=dataapi requires DATA_API_RESOURCE_ARN and DATA_API_SECRET_ARN"
                )
        if self.app_env == "prod" and self.data_api_fake_dsn:
            raise ValueError("DATA_API_FAKE_DSN is for tests only and not allowed in prod")
        return self


@lru_cache
def get_settings() -> Settings:
    from app.core.secrets import load_ssm_secrets

    load_ssm_secrets()  # Production: AI keys from SSM (no-op unless SECRETS_SSM_PATH is set).
    return Settings()
