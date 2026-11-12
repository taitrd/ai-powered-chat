"""A stand-in for the RDS Data API, backed by a real PostgreSQL. Tests and local checks only.

It mimics how the real service handles types, so driver bugs show up locally:
- Each parameter reaches PostgreSQL as text and is cast by its field type or type hint.
  A UUID sent without the UUID hint stays text, so `uuid_column = :id` fails exactly
  as it does on AWS ("operator does not exist: uuid = text").
- Results come back as Data API fields with column metadata (typeName).
"""

import datetime as dt
import itertools
import re

import asyncpg

from app.db.dataapi.client import DataApiError

_PLACEHOLDER = re.compile(r"(?<![:\w]):([A-Za-z_][A-Za-z0-9_]*)")

_HINT_CASTS = {
    "UUID": "uuid",
    "TIMESTAMP": "timestamp",
    "DATE": "date",
    "TIME": "time",
    "DECIMAL": "numeric",
    "JSON": "json",
}
_FIELD_CASTS = {
    "longValue": "int8",
    "booleanValue": "bool",
    "doubleValue": "float8",
    "blobValue": "bytea",
}


def _param_text(value: dict) -> str | None:
    if value.get("isNull"):
        return None
    if "booleanValue" in value:
        return "true" if value["booleanValue"] else "false"
    if "blobValue" in value:
        return "\\x" + bytes(value["blobValue"]).hex()
    for key in ("stringValue", "longValue", "doubleValue"):
        if key in value:
            return str(value[key])
    raise DataApiError("ValidationException", f"Unsupported parameter value: {value}")


def _cast(param: dict) -> str | None:
    if "typeHint" in param:
        return _HINT_CASTS[param["typeHint"]]
    for key, cast in _FIELD_CASTS.items():
        if key in param["value"]:
            return cast
    if param["value"].get("isNull"):
        return None  # Untyped NULL: PostgreSQL infers the type from context.
    return "text"


def _to_field(value, type_name: str) -> dict:
    if value is None:
        return {"isNull": True}
    if type_name == "bool":
        return {"booleanValue": value}
    if type_name in ("int2", "int4", "int8", "oid"):
        return {"longValue": value}
    if type_name in ("float4", "float8"):
        return {"doubleValue": value}
    if type_name == "bytea":
        return {"blobValue": bytes(value)}
    if isinstance(value, dt.datetime):
        if value.tzinfo is not None:
            value = value.astimezone(dt.UTC).replace(tzinfo=None)
        return {"stringValue": value.isoformat(sep=" ")}
    if isinstance(value, dt.date | dt.time):
        return {"stringValue": value.isoformat()}
    return {"stringValue": str(value)}


class FakeDataApiClient:
    def __init__(self, dsn: str) -> None:
        self._dsn = dsn
        self._transactions: dict[str, tuple[asyncpg.Connection, object]] = {}
        self._ids = itertools.count(1)

    def _translate_sql(self, sql: str, parameters: list[dict]) -> tuple[str, list]:
        by_name = {p["name"]: p for p in parameters}
        positions: dict[str, int] = {}
        args: list = []

        def replace(match: re.Match) -> str:
            name = match.group(1)
            if name not in by_name:
                raise DataApiError("BadRequestException", f"Missing parameter: {name}")
            if name not in positions:
                args.append(_param_text(by_name[name]["value"]))
                positions[name] = len(args)
            position = positions[name]
            cast = _cast(by_name[name])
            if cast is None:
                return f"${position}"  # Untyped NULL
            if cast == "text":
                return f"${position}::text"
            return f"(${position}::text)::{cast}"

        return _PLACEHOLDER.sub(replace, sql), args

    async def _run(self, conn: asyncpg.Connection, sql: str, parameters: list[dict]) -> dict:
        query, args = self._translate_sql(sql, parameters)
        try:
            statement = await conn.prepare(query)
            rows = await statement.fetch(*args)
        except asyncpg.PostgresError as exc:
            raise DataApiError("BadRequestException", f"ERROR: {exc}") from exc
        attributes = statement.get_attributes()
        if attributes:
            type_names = [a.type.name for a in attributes]
            return {
                "columnMetadata": [
                    {"name": a.name, "label": a.name, "typeName": a.type.name} for a in attributes
                ],
                "records": [
                    [_to_field(v, t) for v, t in zip(row, type_names, strict=True)] for row in rows
                ],
                "numberOfRecordsUpdated": 0,
            }
        status = statement.get_statusmsg() or ""
        count = int(status.split()[-1]) if status and status.split()[-1].isdigit() else 0
        return {"numberOfRecordsUpdated": count}

    async def execute_statement(
        self, sql: str, parameters: list[dict], transaction_id: str | None
    ) -> dict:
        if transaction_id:
            if transaction_id not in self._transactions:
                raise DataApiError("BadRequestException", "Transaction not found")
            return await self._run(self._transactions[transaction_id][0], sql, parameters)
        conn = await asyncpg.connect(self._dsn)
        try:
            return await self._run(conn, sql, parameters)
        finally:
            await conn.close()

    async def begin_transaction(self) -> str:
        conn = await asyncpg.connect(self._dsn)
        transaction = conn.transaction()
        await transaction.start()
        transaction_id = f"fake-tx-{next(self._ids)}"
        self._transactions[transaction_id] = (conn, transaction)
        return transaction_id

    async def _finish(self, transaction_id: str, commit: bool) -> None:
        conn, transaction = self._transactions.pop(transaction_id)
        try:
            await (transaction.commit() if commit else transaction.rollback())
        except asyncpg.PostgresError as exc:
            raise DataApiError("BadRequestException", f"ERROR: {exc}") from exc
        finally:
            await conn.close()

    async def commit_transaction(self, transaction_id: str) -> None:
        await self._finish(transaction_id, commit=True)

    async def rollback_transaction(self, transaction_id: str) -> None:
        await self._finish(transaction_id, commit=False)
