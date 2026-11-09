"""Tests for Cognito JWT authentication and user isolation."""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from app.core.config import get_settings


# Generate test RSA key pair
@pytest.fixture(scope="session")
def rsa_keys():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = private_key.public_key()
    return private_key, public_key


def create_token(
    private_key,
    *,
    sub: str = "user-123",
    pool_id: str = "us-east-1_testpool",
    client_id: str = "test-client-id",
    region: str = "us-east-1",
    token_use: str = "access",
    expired: bool = False,
) -> str:
    now = datetime.now(UTC)
    exp = now - timedelta(hours=1) if expired else now + timedelta(hours=1)

    payload = {
        "sub": sub,
        "iss": f"https://cognito-idp.{region}.amazonaws.com/{pool_id}",
        "token_use": token_use,
        "exp": int(exp.timestamp()),
        "iat": int(now.timestamp()),
    }
    if token_use == "access":
        payload["client_id"] = client_id
    else:
        payload["aud"] = client_id

    headers = {"kid": "test-key-id"}
    return jwt.encode(payload, private_key, algorithm="RS256", headers=headers)


@pytest.fixture
def cognito_env(monkeypatch, rsa_keys):
    _, public_key = rsa_keys
    settings = get_settings()

    monkeypatch.setattr(settings, "auth_mode", "cognito")
    monkeypatch.setattr(settings, "cognito_user_pool_id", "us-east-1_testpool")
    monkeypatch.setattr(settings, "cognito_client_id", "test-client-id")
    monkeypatch.setattr(settings, "aws_region", "us-east-1")

    # Mock PyJWKClient to return public key
    mock_signing_key = MagicMock()
    mock_signing_key.key = public_key

    mock_client = MagicMock()
    mock_client.get_signing_key_from_jwt.return_value = mock_signing_key

    import app.core.security as security
    monkeypatch.setattr(security, "get_jwks_client", lambda url: mock_client)


@pytest.mark.anyio
async def test_cognito_auth_success(client: httpx.AsyncClient, cognito_env, rsa_keys):
    private_key, _ = rsa_keys
    token = create_token(private_key, sub="alice-cognito-sub")

    response = await client.post(
        "/api/v1/conversations",
        headers={"Authorization": f"Bearer {token}"},
        json={"title": "Cognito Chat"},
    )
    assert response.status_code == 201
    assert response.json()["title"] == "Cognito Chat"


@pytest.mark.anyio
async def test_cognito_missing_header(client: httpx.AsyncClient, cognito_env):
    response = await client.post(
        "/api/v1/conversations",
        json={"title": "No Auth"},
    )
    assert response.status_code == 401
    assert "Missing or invalid Authorization header" in response.json()["detail"]


@pytest.mark.anyio
async def test_cognito_expired_token(client: httpx.AsyncClient, cognito_env, rsa_keys):
    private_key, _ = rsa_keys
    token = create_token(private_key, expired=True)

    response = await client.post(
        "/api/v1/conversations",
        headers={"Authorization": f"Bearer {token}"},
        json={"title": "Expired"},
    )
    assert response.status_code == 401
    assert "expired" in response.json()["detail"].lower()


@pytest.mark.anyio
async def test_cognito_wrong_client_id(client: httpx.AsyncClient, cognito_env, rsa_keys):
    private_key, _ = rsa_keys
    token = create_token(private_key, client_id="wrong-client-id")

    response = await client.post(
        "/api/v1/conversations",
        headers={"Authorization": f"Bearer {token}"},
        json={"title": "Wrong Client"},
    )
    assert response.status_code == 401
    assert "client id" in response.json()["detail"].lower()


@pytest.mark.anyio
async def test_cognito_user_isolation(client: httpx.AsyncClient, cognito_env, rsa_keys):
    private_key, _ = rsa_keys
    token_alice = create_token(private_key, sub="alice-sub")
    token_bob = create_token(private_key, sub="bob-sub")

    # Alice creates conversation
    res_alice = await client.post(
        "/api/v1/conversations",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"title": "Alice Secret"},
    )
    assert res_alice.status_code == 201
    conv_id = res_alice.json()["id"]

    # Bob tries to view Alice's conversation -> 404
    res_bob = await client.get(
        f"/api/v1/conversations/{conv_id}",
        headers={"Authorization": f"Bearer {token_bob}"},
    )
    assert res_bob.status_code == 404

    # Alice views her own conversation -> 200
    res_alice_get = await client.get(
        f"/api/v1/conversations/{conv_id}",
        headers={"Authorization": f"Bearer {token_alice}"},
    )
    assert res_alice_get.status_code == 200
    assert res_alice_get.json()["title"] == "Alice Secret"

