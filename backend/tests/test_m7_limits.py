"""M7: conversation size limit, message pages, clear, and counter-based daily limits."""

import json
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import func, select, update

from app.core.config import get_settings
from app.db.models import Conversation, DailyUsage, Message
from app.db.session import get_sessionmaker
from tests.conftest import as_user

ALICE = as_user("alice")
BOB = as_user("bob")


async def new_chat(client, headers=ALICE) -> str:
    return (await client.post("/api/v1/conversations", json={}, headers=headers)).json()["id"]


async def send(client, conv_id, text_="hi", headers=ALICE):
    return await client.post(
        f"/api/v1/conversations/{conv_id}/messages", json={"content": text_}, headers=headers
    )


def events(body: str) -> list[dict]:
    return [
        json.loads(line[6:])
        for line in body.splitlines()
        if line.startswith("data: ") and line != "data: [DONE]"
    ]


async def seed_messages(conv_id: str, n: int) -> None:
    async with get_sessionmaker()() as session:
        for i in range(n):
            session.add(
                Message(
                    conversation_id=uuid.UUID(conv_id),
                    role="user" if i % 2 == 0 else "assistant",
                    content=f"m{i}",
                    created_at=datetime(2026, 1, 1, tzinfo=UTC) + timedelta(seconds=i),
                )
            )
        await session.execute(
            update(Conversation)
            .where(Conversation.id == uuid.UUID(conv_id))
            .values(message_count=n)
        )
        await session.commit()


@pytest.mark.anyio
async def test_send_updates_count_and_reports_messages_left(client: httpx.AsyncClient):
    conv_id = await new_chat(client)
    response = await send(client, conv_id)
    assert response.status_code == 200
    counts = [e for e in events(response.text) if "message_count" in e]
    assert counts == [{"message_count": 2, "messages_left": 98}]

    conv = (await client.get(f"/api/v1/conversations/{conv_id}", headers=ALICE)).json()
    assert conv["message_count"] == 2
    assert conv["messages_left"] == 98


@pytest.mark.anyio
async def test_full_conversation_returns_409_before_any_ai_call(
    client: httpx.AsyncClient, monkeypatch
):
    conv_id = await new_chat(client)
    await seed_messages(conv_id, 99)  # 99 + 2 > 100: no room for a question and its reply

    def boom(*_a, **_k):
        raise AssertionError("AI provider must not be called for a full chat")

    from app.services import chat

    monkeypatch.setattr(chat, "stream_chat_reply", boom)

    response = await send(client, conv_id)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "conversation_full"

    async with get_sessionmaker()() as session:
        count = await session.scalar(
            select(func.count()).select_from(Message).where(
                Message.conversation_id == uuid.UUID(conv_id)
            )
        )
        used = await session.scalar(select(func.coalesce(func.sum(DailyUsage.messages), 0)))
    assert count == 99  # nothing saved
    assert used == 0  # a refused message is not counted against the daily limit


@pytest.mark.anyio
async def test_last_fitting_message_is_accepted(client: httpx.AsyncClient):
    conv_id = await new_chat(client)
    await seed_messages(conv_id, 98)
    assert (await send(client, conv_id)).status_code == 200
    assert (await send(client, conv_id)).status_code == 409


@pytest.mark.anyio
async def test_clear_resets_count_but_not_daily_limit(client: httpx.AsyncClient):
    conv_id = await new_chat(client)
    await client.patch(f"/api/v1/conversations/{conv_id}", json={"title": "Keep me"}, headers=ALICE)
    await send(client, conv_id)

    response = await client.delete(f"/api/v1/conversations/{conv_id}/messages", headers=ALICE)
    assert response.status_code == 204

    conv = (await client.get(f"/api/v1/conversations/{conv_id}", headers=ALICE)).json()
    assert conv["message_count"] == 0
    assert conv["title"] == "Keep me"
    page = (await client.get(f"/api/v1/conversations/{conv_id}/messages", headers=ALICE)).json()
    assert page["items"] == []

    async with get_sessionmaker()() as session:
        used = await session.scalar(select(func.coalesce(func.sum(DailyUsage.messages), 0)))
    assert used == 1


@pytest.mark.anyio
async def test_clear_is_scoped_to_owner(client: httpx.AsyncClient):
    conv_id = await new_chat(client)
    await send(client, conv_id)
    response = await client.delete(f"/api/v1/conversations/{conv_id}/messages", headers=BOB)
    assert response.status_code == 404
    page = (await client.get(f"/api/v1/conversations/{conv_id}/messages", headers=ALICE)).json()
    assert len(page["items"]) == 2


@pytest.mark.anyio
async def test_messages_are_paged_newest_page_first(client: httpx.AsyncClient):
    conv_id = await new_chat(client)
    await seed_messages(conv_id, 7)
    url = f"/api/v1/conversations/{conv_id}/messages"

    first = (await client.get(url, params={"limit": 3}, headers=ALICE)).json()
    assert [m["content"] for m in first["items"]] == ["m4", "m5", "m6"]
    assert first["next_cursor"]

    second = (
        await client.get(url, params={"limit": 3, "before": first["next_cursor"]}, headers=ALICE)
    ).json()
    assert [m["content"] for m in second["items"]] == ["m1", "m2", "m3"]

    last = (
        await client.get(url, params={"limit": 3, "before": second["next_cursor"]}, headers=ALICE)
    ).json()
    assert [m["content"] for m in last["items"]] == ["m0"]
    assert last["next_cursor"] is None


@pytest.mark.anyio
async def test_invalid_message_cursor_returns_400(client: httpx.AsyncClient):
    conv_id = await new_chat(client)
    response = await client.get(
        f"/api/v1/conversations/{conv_id}/messages", params={"before": "bad"}, headers=ALICE
    )
    assert response.status_code == 400


@pytest.mark.anyio
async def test_global_daily_limit_uses_counters(client: httpx.AsyncClient, monkeypatch):
    monkeypatch.setattr(get_settings(), "daily_global_message_limit", 1)
    assert (await send(client, await new_chat(client, ALICE), headers=ALICE)).status_code == 200
    response = await send(client, await new_chat(client, BOB), headers=BOB)
    assert response.status_code == 429
