"""Unit tests for business services."""

import pytest

from app.db.models import User
from app.db.session import get_sessionmaker
from app.repositories import conversations as conv_repo
from app.services.chat import generate_title, prepare_user_turn
from app.services.limits import (
    InvalidMessageLengthError,
    validate_message_length,
)


def test_validate_message_length():
    assert validate_message_length("  hello world  ") == "hello world"

    with pytest.raises(InvalidMessageLengthError):
        validate_message_length("   ")

    with pytest.raises(InvalidMessageLengthError):
        validate_message_length("a" * 10, max_chars=5)


def test_generate_title():
    short = "What is Python?"
    assert generate_title(short) == short

    long_msg = "x" * 100
    assert generate_title(long_msg) == ("x" * 57) + "..."


@pytest.mark.anyio
async def test_prepare_user_turn():
    async with get_sessionmaker()() as session:
        user = User(cognito_sub="service-user-1")
        session.add(user)
        await session.commit()
        await session.refresh(user)

        conv = await conv_repo.create(session, user.id, title="New Chat")

        user_msg, context = await prepare_user_turn(
            session=session,
            conversation=conv,
            raw_content="Explain quantum computing briefly",
            provider_id="fake",
        )

        assert user_msg.id is not None
        assert user_msg.role == "user"
        assert conv.title == "Explain quantum computing briefly"
        assert len(context) == 1
        assert context[0].content == "Explain quantum computing briefly"
