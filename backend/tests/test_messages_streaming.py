"""Tests for message creation, SSE streaming, and limit enforcement."""

import json

import httpx
import pytest

from tests.conftest import as_user


@pytest.mark.anyio
async def test_list_models(client: httpx.AsyncClient):
    response = await client.get("/api/v1/models")
    assert response.status_code == 200
    models = response.json()
    assert isinstance(models, list)
    assert any(m["id"] == "fake" for m in models)


@pytest.mark.anyio
async def test_send_message_streaming(client: httpx.AsyncClient):
    # 1. Create a conversation
    conv_res = await client.post(
        "/api/v1/conversations",
        headers=as_user("alice"),
        json={"title": "New Chat"},
    )
    assert conv_res.status_code == 201
    conv_id = conv_res.json()["id"]

    # 2. Send message and read SSE stream
    async with client.stream(
        "POST",
        f"/api/v1/conversations/{conv_id}/messages",
        headers=as_user("alice"),
        json={"content": "What is the capital of France?", "provider_id": "fake"},
    ) as response:
        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]

        deltas = []
        done_received = False
        async for line in response.aiter_lines():
            if line.startswith("data: "):
                payload = line[6:]
                if payload == "[DONE]":
                    done_received = True
                    break
                data = json.loads(payload)
                if "delta" in data:
                    deltas.append(data["delta"])

        assert done_received
        assert len(deltas) > 0
        full_reply = "".join(deltas)
        assert "test reply from the fake provider" in full_reply

    # 3. Check messages persisted in DB
    msg_res = await client.get(
        f"/api/v1/conversations/{conv_id}/messages",
        headers=as_user("alice"),
    )
    assert msg_res.status_code == 200
    messages = msg_res.json()
    assert len(messages) == 2
    assert messages[0]["role"] == "user"
    assert messages[0]["content"] == "What is the capital of France?"
    assert messages[1]["role"] == "assistant"
    assert messages[1]["content"] == full_reply
    assert messages[1]["provider"] == "fake"

    # 4. Check that conversation title was auto-updated from "New Chat"
    conv_updated = await client.get(
        f"/api/v1/conversations/{conv_id}",
        headers=as_user("alice"),
    )
    assert conv_updated.status_code == 200
    assert conv_updated.json()["title"] == "What is the capital of France?"


@pytest.mark.anyio
async def test_send_message_length_validation(client: httpx.AsyncClient):
    conv_res = await client.post(
        "/api/v1/conversations",
        headers=as_user("alice"),
        json={},
    )
    conv_id = conv_res.json()["id"]

    # Empty message
    empty_res = await client.post(
        f"/api/v1/conversations/{conv_id}/messages",
        headers=as_user("alice"),
        json={"content": "   "},
    )
    assert empty_res.status_code == 400

    # Over 4000 characters
    long_res = await client.post(
        f"/api/v1/conversations/{conv_id}/messages",
        headers=as_user("alice"),
        json={"content": "x" * 4001},
    )
    assert long_res.status_code == 400


@pytest.mark.anyio
async def test_user_daily_limit_enforced(client: httpx.AsyncClient, monkeypatch):
    from app.core.config import get_settings
    settings = get_settings()
    monkeypatch.setattr(settings, "daily_user_message_limit", 2)

    conv_res = await client.post(
        "/api/v1/conversations",
        headers=as_user("bob"),
        json={},
    )
    conv_id = conv_res.json()["id"]

    # First message -> ok
    r1 = await client.post(
        f"/api/v1/conversations/{conv_id}/messages",
        headers=as_user("bob"),
        json={"content": "Msg 1"},
    )
    assert r1.status_code == 200

    # Second message -> ok
    r2 = await client.post(
        f"/api/v1/conversations/{conv_id}/messages",
        headers=as_user("bob"),
        json={"content": "Msg 2"},
    )
    assert r2.status_code == 200

    # Third message -> 429
    r3 = await client.post(
        f"/api/v1/conversations/{conv_id}/messages",
        headers=as_user("bob"),
        json={"content": "Msg 3"},
    )
    assert r3.status_code == 429
    assert "Daily user limit reached" in r3.json()["detail"]


@pytest.mark.anyio
async def test_send_message_user_isolation(client: httpx.AsyncClient):
    conv_res = await client.post(
        "/api/v1/conversations",
        headers=as_user("alice"),
        json={},
    )
    conv_id = conv_res.json()["id"]

    # Bob attempts to send message to Alice's conversation
    response = await client.post(
        f"/api/v1/conversations/{conv_id}/messages",
        headers=as_user("bob"),
        json={"content": "Sneaky message"},
    )
    assert response.status_code == 404
