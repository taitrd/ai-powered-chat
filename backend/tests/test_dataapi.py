"""Data API driver (proof of concept): value conversion and a round trip through the fake."""

import datetime as dt
import decimal
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

import app.db.dataapi  # noqa: F401  Registers the dialect.
from app.db.dataapi.client import DataApiError, from_field, to_parameter
from app.db.dataapi.fake import FakeDataApiClient
from tests.conftest import TEST_DATABASE_URL

FAKE_DSN = TEST_DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, {"value": {"isNull": True}}),
        (True, {"value": {"booleanValue": True}}),
        (42, {"value": {"longValue": 42}}),
        (1.5, {"value": {"doubleValue": 1.5}}),
        ("hi", {"value": {"stringValue": "hi"}}),
        (
            uuid.UUID("12345678-1234-5678-1234-567812345678"),
            {"value": {"stringValue": "12345678-1234-5678-1234-567812345678"}, "typeHint": "UUID"},
        ),
        (
            dt.datetime(2026, 11, 12, 10, 0, 0, 123456, tzinfo=dt.timezone(dt.timedelta(hours=7))),
            {"value": {"stringValue": "2026-11-12 03:00:00.123456"}, "typeHint": "TIMESTAMP"},
        ),
        (decimal.Decimal("1.25"), {"value": {"stringValue": "1.25"}, "typeHint": "DECIMAL"}),
    ],
)
def test_parameters_use_data_api_fields_and_type_hints(value, expected):
    assert to_parameter("p", value) == {"name": "p", **expected}


def test_result_fields_convert_by_column_type():
    assert from_field({"isNull": True}, "uuid") is None
    assert from_field({"stringValue": "12345678-1234-5678-1234-567812345678"}, "uuid") == uuid.UUID(
        "12345678-1234-5678-1234-567812345678"
    )
    stamp = from_field({"stringValue": "2026-11-12 03:00:00.5"}, "timestamptz")
    assert stamp == dt.datetime(2026, 11, 12, 3, 0, 0, 500000, tzinfo=dt.UTC)
    assert from_field({"longValue": 7}, "int8") == 7
    assert from_field({"stringValue": "x"}, "varchar") == "x"


@pytest.mark.anyio
async def test_fake_rejects_uuid_without_type_hint_like_aws():
    # The real Data API compares an un-hinted string with a uuid column as text and fails.
    # This is why the driver must always send the UUID type hint.
    client = FakeDataApiClient(FAKE_DSN)
    untyped = [{"name": "id", "value": {"stringValue": str(uuid.uuid4())}}]
    with pytest.raises(DataApiError, match="operator does not exist"):
        await client.execute_statement("SELECT 1 FROM users WHERE id = :id", untyped, None)


@pytest.mark.anyio
async def test_engine_round_trip_with_transactions():
    engine = create_async_engine(
        "postgresql+dataapi://", connect_args={"client": FakeDataApiClient(FAKE_DSN)}
    )
    sub = f"dataapi-test|{uuid.uuid4()}"
    try:
        async with engine.begin() as conn:  # Committed transaction
            new_id = (
                await conn.execute(
                    text("INSERT INTO users (cognito_sub) VALUES (:sub) RETURNING id"), {"sub": sub}
                )
            ).scalar_one()
        assert isinstance(new_id, uuid.UUID)

        async with engine.connect() as conn:  # Rolled-back transaction
            await conn.execute(text("DELETE FROM users WHERE id = :id"), {"id": new_id})
            await conn.rollback()

        async with engine.connect() as conn:
            row = (
                await conn.execute(
                    text("SELECT id, created_at FROM users WHERE id = :id"), {"id": new_id}
                )
            ).one()
        assert row.id == new_id
        assert row.created_at.tzinfo is not None

        async with engine.begin() as conn:
            deleted = await conn.execute(text("DELETE FROM users WHERE id = :id"), {"id": new_id})
        assert deleted.rowcount == 1
    finally:
        await engine.dispose()


@pytest.mark.anyio
async def test_boto_client_sends_only_parameters_each_call_accepts():
    # Validated against the real rds-data API model, so a wrong parameter fails here.
    import boto3
    from botocore.stub import Stubber

    from app.db.dataapi.client import BotoDataApiClient

    client = BotoDataApiClient(
        "arn:aws:rds:us-east-1:1:cluster:c", "arn:aws:secretsmanager:s", "db", "us-east-1"
    )
    client._client = boto3.client("rds-data", region_name="us-east-1")
    auth = {
        "resourceArn": "arn:aws:rds:us-east-1:1:cluster:c",
        "secretArn": "arn:aws:secretsmanager:s",
    }
    with Stubber(client._client) as stub:
        stub.add_response("begin_transaction", {"transactionId": "tx"}, {**auth, "database": "db"})
        stub.add_response(
            "execute_statement",
            {"numberOfRecordsUpdated": 0},
            {
                **auth,
                "database": "db",
                "sql": "SELECT 1",
                "parameters": [],
                "includeResultMetadata": True,
                "transactionId": "tx",
            },
        )
        stub.add_response(
            "commit_transaction", {"transactionStatus": "ok"}, {**auth, "transactionId": "tx"}
        )
        stub.add_response(
            "rollback_transaction", {"transactionStatus": "ok"}, {**auth, "transactionId": "tx"}
        )

        assert await client.begin_transaction() == "tx"
        await client.execute_statement("SELECT 1", [], "tx")
        await client.commit_transaction("tx")
        await client.rollback_transaction("tx")
        stub.assert_no_pending_responses()


@pytest.mark.anyio
async def test_driver_waits_while_aurora_resumes(monkeypatch):
    from app.db.dataapi import dialect

    monkeypatch.setattr(dialect.asyncio, "sleep", _no_sleep)
    attempts = {"begin": 0}

    class ResumingClient(FakeDataApiClient):
        async def begin_transaction(self) -> str:
            attempts["begin"] += 1
            if attempts["begin"] < 3:
                raise DataApiError("DatabaseResumingException", "The database is resuming")
            return await super().begin_transaction()

    engine = create_async_engine(
        "postgresql+dataapi://", connect_args={"client": ResumingClient(FAKE_DSN)}
    )
    try:
        async with engine.connect() as conn:
            assert (await conn.execute(text("SELECT 1"))).scalar_one() == 1
    finally:
        await engine.dispose()
    assert attempts["begin"] >= 3


@pytest.mark.anyio
async def test_driver_does_not_retry_other_errors():
    from app.db.dataapi.dialect import with_resume_retry

    calls = 0

    async def failing():
        nonlocal calls
        calls += 1
        raise DataApiError("BadRequestException", "syntax error")

    with pytest.raises(DataApiError):
        await with_resume_retry(failing)
    assert calls == 1


async def _no_sleep(_seconds: float) -> None:
    return None
