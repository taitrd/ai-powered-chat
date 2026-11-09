"""Identify and authenticate the current user.

AUTH_MODE=local (development and tests): the user comes from the optional
`X-Dev-User` header, defaulting to "dev".
AUTH_MODE=cognito: validates Cognito JWT access/id tokens against Cognito JWKS.
"""

import re
from typing import Any

import jwt
from fastapi import Depends, Header, HTTPException, status
from jwt import PyJWKClient, PyJWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.db.models import User
from app.db.session import get_session
from app.repositories import users as users_repo

DEV_USER_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

_jwks_client: PyJWKClient | None = None


def get_jwks_client(jwks_url: str) -> PyJWKClient:
    """Cached PyJWKClient instance."""
    global _jwks_client
    if _jwks_client is None or _jwks_client.uri != jwks_url:
        _jwks_client = PyJWKClient(jwks_url, cache_keys=True, max_cached_keys=16)
    return _jwks_client


def verify_cognito_token(token: str, settings: Settings) -> dict[str, Any]:
    """Verify Cognito JWT signature, issuer, expiration, and client_id before any DB access."""
    if not (settings.cognito_user_pool_id and settings.cognito_client_id):
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "Cognito configuration missing (pool ID or client ID)",
        )

    issuer = f"https://cognito-idp.{settings.aws_region}.amazonaws.com/{settings.cognito_user_pool_id}"
    jwks_url = f"{issuer}/.well-known/jwks.json"

    try:
        client = get_jwks_client(jwks_url)
        signing_key = client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=issuer,
            options={"verify_aud": False},
        )
    except PyJWTError as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            f"Invalid token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    # Validate client_id and token_use
    token_use = payload.get("token_use")
    if token_use == "access":
        token_client_id = payload.get("client_id")
    elif token_use == "id":
        token_client_id = payload.get("aud")
    else:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Invalid token_use claim",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if token_client_id != settings.cognito_client_id:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Token was not issued for this client ID",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not payload.get("sub"):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Token missing sub claim",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return payload


async def get_subject(
    settings: Settings = Depends(get_settings),
    authorization: str | None = Header(default=None),
    x_dev_user: str | None = Header(default=None),
) -> str:
    """Return a stable identifier for the caller, checked before any database access."""
    if settings.auth_mode == "local":
        name = x_dev_user or "dev"
        if not DEV_USER_PATTERN.match(name):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid development user")
        return f"local|{name}"

    if settings.auth_mode == "cognito":
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                "Missing or invalid Authorization header",
                headers={"WWW-Authenticate": "Bearer"},
            )
        token = authorization.split(" ", 1)[1].strip()
        payload = verify_cognito_token(token, settings)
        return f"cognito|{payload['sub']}"

    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unsupported auth mode")


async def get_current_user(
    subject: str = Depends(get_subject),
    session: AsyncSession = Depends(get_session),
) -> User:
    """Load the user for this subject, creating the row on first request."""
    return await users_repo.get_or_create_by_sub(session, subject)
