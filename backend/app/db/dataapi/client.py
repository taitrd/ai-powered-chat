"""Data API clients: the interface, the real AWS client, and value conversion.

The Data API sends every parameter and result value as a typed "field", for example
{"stringValue": "abc"} or {"longValue": 5}. These helpers convert between those fields
and Python values.
"""

import asyncio
import datetime as dt
import decimal
import json
import uuid
from typing import Any, Protocol

# --- Errors -----------------------------------------------------------------------


class DataApiError(Exception):
    """A Data API call failed. `code` is the AWS error code, e.g. BadRequestException."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


# --- Client interface -------------------------------------------------------------


class DataApiClient(Protocol):
    async def execute_statement(
        self, sql: str, parameters: list[dict], transaction_id: str | None
    ) -> dict: ...

    async def begin_transaction(self) -> str: ...

    # Commit and rollback take only the ARNs and transaction ID (no "database").
    async def commit_transaction(self, transaction_id: str) -> None: ...

    async def rollback_transaction(self, transaction_id: str) -> None: ...


class BotoDataApiClient:
    """Calls the real RDS Data API with boto3, in a worker thread so the event loop stays free."""

    def __init__(self, resource_arn: str, secret_arn: str, database: str, region: str) -> None:
        import boto3

        self._client = boto3.client("rds-data", region_name=region)
        self._auth = {"resourceArn": resource_arn, "secretArn": secret_arn}
        self._database = database

    async def _call(self, method: str, **kwargs: Any) -> dict:
        from botocore.exceptions import ClientError

        try:
            return await asyncio.to_thread(getattr(self._client, method), **self._auth, **kwargs)
        except ClientError as exc:
            error = exc.response.get("Error", {})
            code, message = error.get("Code", "ClientError"), error.get("Message", str(exc))
            raise DataApiError(code, message) from exc

    async def execute_statement(
        self, sql: str, parameters: list[dict], transaction_id: str | None
    ) -> dict:
        kwargs: dict[str, Any] = {
            "database": self._database,
            "sql": sql,
            "parameters": parameters,
            "includeResultMetadata": True,
        }
        if transaction_id:
            kwargs["transactionId"] = transaction_id
        return await self._call("execute_statement", **kwargs)

    async def begin_transaction(self) -> str:
        response = await self._call("begin_transaction", database=self._database)
        return response["transactionId"]

    async def commit_transaction(self, transaction_id: str) -> None:
        await self._call("commit_transaction", transactionId=transaction_id)

    async def rollback_transaction(self, transaction_id: str) -> None:
        await self._call("rollback_transaction", transactionId=transaction_id)


# --- Parameters: Python value -> Data API field ------------------------------------


def _timestamp_text(value: dt.datetime) -> str:
    # The Data API reads TIMESTAMP hints as "YYYY-MM-DD HH:MM:SS[.ffffff]" with no zone,
    # so aware datetimes are converted to UTC (the database session time zone).
    if value.tzinfo is not None:
        value = value.astimezone(dt.UTC).replace(tzinfo=None)
    return value.isoformat(sep=" ")


def to_parameter(name: str, value: Any) -> dict:
    """Builds one Data API SqlParameter for a named bind parameter."""
    param: dict[str, Any] = {"name": name}
    if value is None:
        param["value"] = {"isNull": True}
    elif isinstance(value, bool):  # before int: bool is a subclass of int
        param["value"] = {"booleanValue": value}
    elif isinstance(value, int):
        param["value"] = {"longValue": value}
    elif isinstance(value, float):
        param["value"] = {"doubleValue": value}
    elif isinstance(value, decimal.Decimal):
        param["value"] = {"stringValue": str(value)}
        param["typeHint"] = "DECIMAL"
    elif isinstance(value, uuid.UUID):
        param["value"] = {"stringValue": str(value)}
        param["typeHint"] = "UUID"
    elif isinstance(value, dt.datetime):
        param["value"] = {"stringValue": _timestamp_text(value)}
        param["typeHint"] = "TIMESTAMP"
    elif isinstance(value, dt.date):
        param["value"] = {"stringValue": value.isoformat()}
        param["typeHint"] = "DATE"
    elif isinstance(value, dt.time):
        param["value"] = {"stringValue": value.isoformat()}
        param["typeHint"] = "TIME"
    elif isinstance(value, bytes | bytearray | memoryview):
        param["value"] = {"blobValue": bytes(value)}
    elif isinstance(value, dict | list):
        param["value"] = {"stringValue": json.dumps(value)}
        param["typeHint"] = "JSON"
    else:
        param["value"] = {"stringValue": str(value)}
    return param


# --- Results: Data API field -> Python value ---------------------------------------


def _parse_timestamp(text: str) -> dt.datetime:
    return dt.datetime.fromisoformat(text.replace(" ", "T", 1))


def from_field(field: dict, type_name: str) -> Any:
    """Converts one result field, using the column's PostgreSQL type name."""
    if field.get("isNull"):
        return None
    if "stringValue" in field:
        text = field["stringValue"]
        type_name = type_name.lower()
        if type_name == "uuid":
            return uuid.UUID(text)
        if type_name == "timestamptz":
            return _parse_timestamp(text).replace(tzinfo=dt.UTC)
        if type_name == "timestamp":
            return _parse_timestamp(text)
        if type_name == "date":
            return dt.date.fromisoformat(text)
        if type_name == "numeric":
            return decimal.Decimal(text)
        return text
    for key in ("booleanValue", "longValue", "doubleValue", "blobValue"):
        if key in field:
            return field[key]
    if "arrayValue" in field:
        return field["arrayValue"]
    raise ValueError(f"Unsupported Data API field: {field}")
