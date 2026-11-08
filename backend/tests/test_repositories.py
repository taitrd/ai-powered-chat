"""Unit tests for database repositories."""

from datetime import UTC, datetime

import pytest

from app.db.models import User
from app.db.session import get_sessionmaker
from app.repositories import conversations as conv_repo
from app.repositories import messages as msg_repo


@pytest.mark.anyio
async def test_conversation_repository():
    async with get_sessionmaker()() as session:
        # Create test user
        user = User(cognito_sub="repo-user-1")
        session.add(user)
        await session.commit()
        await session.refresh(user)

        # 1. Create conversation
        conv = await conv_repo.create(session, user.id, title="Test Repo Chat")
        assert conv.id is not None
        assert conv.title == "Test Repo Chat"

        # 2. Get owned conversation
        fetched = await conv_repo.get_owned(session, user.id, conv.id)
        assert fetched is not None
        assert fetched.id == conv.id

        # 3. Rename conversation
        renamed = await conv_repo.rename(session, conv, "Renamed Repo Chat")
        assert renamed.title == "Renamed Repo Chat"

        # 4. List page
        items, next_cursor = await conv_repo.list_page(session, user.id, limit=10)
        assert len(items) == 1
        assert next_cursor is None

        # 5. Delete conversation
        deleted = await conv_repo.delete(session, user.id, conv.id)
        assert deleted is True

        # Verify not found after delete
        not_found = await conv_repo.get_owned(session, user.id, conv.id)
        assert not_found is None


@pytest.mark.anyio
async def test_message_repository():
    async with get_sessionmaker()() as session:
        user = User(cognito_sub="repo-user-2")
        session.add(user)
        await session.commit()
        await session.refresh(user)

        conv = await conv_repo.create(session, user.id, title="Msg Test")

        # Add user and assistant messages
        m1 = await msg_repo.add_message(session, conv.id, role="user", content="Hello")
        m2 = await msg_repo.add_message(
            session, conv.id, role="assistant", content="Hi!", provider="fake", model="fake-model"
        )
        assert m1.id is not None
        assert m2.id is not None

        # List for conversation
        all_msgs = await msg_repo.list_for_conversation(session, conv.id)
        assert len(all_msgs) == 2
        assert all_msgs[0].content == "Hello"
        assert all_msgs[1].content == "Hi!"

        # History context
        history = await msg_repo.get_recent_history(session, conv.id, limit=1)
        assert len(history) == 1
        assert history[0].content == "Hi!"

        # Counts
        now = datetime.now(UTC)
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
        user_count = await msg_repo.count_user_messages_since(session, user.id, start_of_day)
        assert user_count == 1  # only role == "user" counts

        global_count = await msg_repo.count_global_messages_since(session, start_of_day)
        assert global_count >= 1
