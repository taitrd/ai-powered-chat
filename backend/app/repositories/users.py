"""Data access functions for users."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User


async def get_by_id(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    """Fetch user by primary key."""
    return await session.get(User, user_id)


async def get_or_create_by_sub(session: AsyncSession, cognito_sub: str) -> User:
    """Get user by Cognito sub claim, or insert a new user row on first login."""
    user = await session.scalar(select(User).where(User.cognito_sub == cognito_sub))
    if user is not None:
        return user

    user = User(cognito_sub=cognito_sub)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user
