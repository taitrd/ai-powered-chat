"""Settings refuse unsafe combinations."""

import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_local_auth_is_refused_in_production():
    with pytest.raises(ValidationError, match="AUTH_MODE=local"):
        Settings(app_env="prod", auth_mode="local")


def test_cognito_auth_requires_pool_and_client():
    with pytest.raises(ValidationError, match="COGNITO_USER_POOL_ID"):
        Settings(auth_mode="cognito")


def test_production_with_cognito_is_accepted():
    settings = Settings(
        app_env="prod",
        auth_mode="cognito",
        cognito_user_pool_id="us-east-1_example",
        cognito_client_id="client",
    )
    assert settings.auth_mode == "cognito"
