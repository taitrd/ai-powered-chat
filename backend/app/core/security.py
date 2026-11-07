"""Identify the current user.

AUTH_MODE=local (development and tests): the user comes from the optional
`X-Dev-User` header, defaulting to "dev". AUTH_MODE=cognito validates Cognito
access tokens and is added in milestone M4.
"""

import re

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.db.models import User
from app.db.session import get_session

DEV_USER_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


async def get_subject(
    settings: Settings = Depends(get_settings),
    x_dev_user: str | None = Header(default=None),
) -> str:
    """Return a stable identifier for the caller, checked before any database access."""
    if settings.auth_mode == "local":
        name = x_dev_user or "dev"
        if not DEV_USER_PATTERN.match(name):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid development user")
        return f"local|{name}"
    raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "Cognito auth arrives in M4")


async def get_current_user(
    subject: str = Depends(get_subject),
    session: AsyncSession = Depends(get_session),
) -> User:
    """Load the user for this subject, creating the row on first request."""
    user = await session.scalar(select(User).where(User.cognito_sub == subject))
    if user is None:
        await session.execute(
            insert(User)
            .values(cognito_sub=subject)
            .on_conflict_do_nothing(index_elements=[User.cognito_sub])
        )
        await session.commit()
        user = await session.scalar(select(User).where(User.cognito_sub == subject))
    return user
