"""Conversation CRUD, pagination and user isolation."""

import uuid

import pytest
from sqlalchemy import func, select

from app.db.models import Conversation, Message
from app.db.session import get_sessionmaker
from tests.conftest import as_user

pytestmark = pytest.mark.anyio

ALICE = as_user("alice")
BOB = as_user("bob")


async def create(client, headers=ALICE, **body):
    response = await client.post("/api/v1/conversations", json=body, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


async def test_healthz_needs_no_auth_or_database(client):
    response = await client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_create_uses_default_title(client):
    conversation = await create(client)
    assert conversation["title"] == "New Chat"
    assert conversation["provider_id"] is None
    uuid.UUID(conversation["id"])


async def test_create_with_title_strips_whitespace(client):
    conversation = await create(client, title="  Trip ideas  ")
    assert conversation["title"] == "Trip ideas"


@pytest.mark.parametrize("title", ["", "   ", "x" * 201])
async def test_invalid_titles_are_rejected(client, title):
    response = await client.post("/api/v1/conversations", json={"title": title}, headers=ALICE)
    assert response.status_code == 422


async def test_get_conversation(client):
    created = await create(client, title="Hello")
    response = await client.get(f"/api/v1/conversations/{created['id']}", headers=ALICE)
    assert response.status_code == 200
    assert response.json() == created


async def test_list_is_newest_activity_first(client):
    first = await create(client, title="first")
    second = await create(client, title="second")

    items = (await client.get("/api/v1/conversations", headers=ALICE)).json()["items"]
    assert [c["title"] for c in items] == ["second", "first"]

    # Renaming counts as activity and moves the conversation to the top.
    await client.patch(
        f"/api/v1/conversations/{first['id']}", json={"title": "first, renamed"}, headers=ALICE
    )
    items = (await client.get("/api/v1/conversations", headers=ALICE)).json()["items"]
    assert [c["id"] for c in items] == [first["id"], second["id"]]


async def test_list_paginates_with_cursor(client):
    ids = [(await create(client, title=f"chat {i}"))["id"] for i in range(5)]

    page1 = (await client.get("/api/v1/conversations?limit=2", headers=ALICE)).json()
    page2 = (
        await client.get(
            f"/api/v1/conversations?limit=2&cursor={page1['next_cursor']}", headers=ALICE
        )
    ).json()
    page3 = (
        await client.get(
            f"/api/v1/conversations?limit=2&cursor={page2['next_cursor']}", headers=ALICE
        )
    ).json()

    seen = [c["id"] for page in (page1, page2, page3) for c in page["items"]]
    assert seen == list(reversed(ids))
    assert page3["next_cursor"] is None


async def test_invalid_cursor_returns_400(client):
    response = await client.get("/api/v1/conversations?cursor=not-a-cursor", headers=ALICE)
    assert response.status_code == 400


async def test_rename_updates_title_and_activity(client):
    created = await create(client)
    response = await client.patch(
        f"/api/v1/conversations/{created['id']}", json={"title": "Renamed"}, headers=ALICE
    )
    assert response.status_code == 200
    renamed = response.json()
    assert renamed["title"] == "Renamed"
    assert renamed["updated_at"] > created["updated_at"]


async def test_delete_removes_conversation_and_its_messages(client):
    created = await create(client)
    conversation_id = uuid.UUID(created["id"])
    async with get_sessionmaker()() as session:
        session.add_all(
            [
                Message(conversation_id=conversation_id, role="user", content="Hi"),
                Message(conversation_id=conversation_id, role="assistant", content="Hello!"),
            ]
        )
        await session.commit()

    response = await client.delete(f"/api/v1/conversations/{created['id']}", headers=ALICE)
    assert response.status_code == 204

    after = await client.get(f"/api/v1/conversations/{created['id']}", headers=ALICE)
    assert after.status_code == 404
    async with get_sessionmaker()() as session:
        remaining = await session.scalar(
            select(func.count())
            .select_from(Message)
            .where(Message.conversation_id == conversation_id)
        )
    assert remaining == 0


async def test_messages_are_returned_oldest_first(client):
    created = await create(client)
    conversation_id = uuid.UUID(created["id"])
    async with get_sessionmaker()() as session:
        for role, content in [("user", "one"), ("assistant", "two"), ("user", "three")]:
            session.add(Message(conversation_id=conversation_id, role=role, content=content))
            await session.commit()

    response = await client.get(f"/api/v1/conversations/{created['id']}/messages", headers=ALICE)
    assert response.status_code == 200
    assert [m["content"] for m in response.json()] == ["one", "two", "three"]


async def test_unknown_conversation_returns_404(client):
    missing = uuid.uuid4()
    for method, path in [
        ("GET", f"/api/v1/conversations/{missing}"),
        ("PATCH", f"/api/v1/conversations/{missing}"),
        ("DELETE", f"/api/v1/conversations/{missing}"),
        ("GET", f"/api/v1/conversations/{missing}/messages"),
    ]:
        body = {"title": "x"} if method == "PATCH" else None
        response = await client.request(method, path, json=body, headers=ALICE)
        assert response.status_code == 404, (method, path)


async def test_invalid_conversation_id_returns_422(client):
    response = await client.get("/api/v1/conversations/not-a-uuid", headers=ALICE)
    assert response.status_code == 422


async def test_users_cannot_see_or_change_each_others_conversations(client):
    alice_chat = await create(client, headers=ALICE, title="Alice only")
    path = f"/api/v1/conversations/{alice_chat['id']}"

    assert (await client.get("/api/v1/conversations", headers=BOB)).json()["items"] == []
    assert (await client.get(path, headers=BOB)).status_code == 404
    assert (await client.get(f"{path}/messages", headers=BOB)).status_code == 404
    assert (await client.patch(path, json={"title": "hacked"}, headers=BOB)).status_code == 404
    assert (await client.delete(path, headers=BOB)).status_code == 404

    # Alice's conversation is unchanged.
    response = await client.get(path, headers=ALICE)
    assert response.status_code == 200
    assert response.json()["title"] == "Alice only"


async def test_user_row_is_created_once(client):
    await create(client)
    await create(client)
    async with get_sessionmaker()() as session:
        owners = await session.scalar(select(func.count(func.distinct(Conversation.user_id))))
    assert owners == 1


async def test_invalid_dev_user_is_rejected(client):
    response = await client.get("/api/v1/conversations", headers={"X-Dev-User": "bad name!"})
    assert response.status_code == 401
