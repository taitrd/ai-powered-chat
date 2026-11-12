"""SQLAlchemy dialect `postgresql+dataapi://`: PostgreSQL SQL, sent through the RDS Data API.

Built on SQLAlchemy's generic asyncio adapters (the same base its aiosqlite and
aiomysql drivers use). Each DBAPI connection lazily opens a Data API transaction on
its first statement, like a normal PostgreSQL connection, and commits or rolls it back
when SQLAlchemy does.

Configure with connect_args={"client": <DataApiClient>}.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

from sqlalchemy.connectors.asyncio import AsyncAdapt_dbapi_connection, AsyncAdapt_dbapi_cursor
from sqlalchemy.dialects.postgresql.base import PGDialect
from sqlalchemy.pool import NullPool

from app.db.dataapi.client import DataApiClient, DataApiError, from_field, to_parameter

# --- PEP 249 exception hierarchy ------------------------------------------------------


class Error(Exception):
    pass


class InterfaceError(Error):
    pass


class DatabaseError(Error):
    pass


class DataError(DatabaseError):
    pass


class OperationalError(DatabaseError):
    pass


class IntegrityError(DatabaseError):
    pass


class InternalError(DatabaseError):
    pass


class ProgrammingError(DatabaseError):
    pass


class NotSupportedError(DatabaseError):
    pass


def _translate(exc: DataApiError) -> DatabaseError:
    message = str(exc)
    lowered = message.lower()
    if exc.code == "DatabaseResumingException" or "resuming" in lowered:
        return OperationalError(message)  # Aurora is waking up: callers may retry.
    if "duplicate key" in lowered or "violates" in lowered:
        return IntegrityError(message)
    if exc.code in ("BadRequestException", "ValidationException"):
        return ProgrammingError(message)
    return OperationalError(message)


# --- Waking Aurora --------------------------------------------------------------------

#: How long to keep retrying while a paused Aurora cluster resumes.
RESUME_MAX_WAIT_SECONDS = 45.0


def is_resuming(exc: DataApiError) -> bool:
    return exc.code == "DatabaseResumingException" or "resuming" in str(exc).lower()


async def with_resume_retry(call, *args):
    """Retries a Data API call while Aurora resumes from pause, then gives up."""
    started, delay = time.monotonic(), 1.0
    while True:
        try:
            return await call(*args)
        except DataApiError as exc:
            elapsed = time.monotonic() - started
            if not is_resuming(exc) or elapsed >= RESUME_MAX_WAIT_SECONDS:
                raise
            await asyncio.sleep(min(delay, RESUME_MAX_WAIT_SECONDS - elapsed))
            delay = min(delay * 1.5, 5.0)


# --- Async DBAPI over the Data API --------------------------------------------------


class AsyncDataApiCursor:
    arraysize = 1

    def __init__(self, connection: AsyncDataApiConnection) -> None:
        self._connection = connection
        self.description: list[tuple] | None = None
        self.rowcount = -1
        self.lastrowid = None
        self._rows: list[tuple] = []

    async def __aenter__(self) -> AsyncDataApiCursor:
        return self

    async def execute(self, operation: str, parameters: Any = None) -> None:
        params = parameters or {}
        if not isinstance(params, dict):
            raise ProgrammingError("The Data API driver only supports named parameters")
        response = await self._connection._execute(
            operation, [to_parameter(name, value) for name, value in params.items()]
        )

        columns = response.get("columnMetadata") or []
        records = response.get("records")
        if columns:
            type_names = [c.get("typeName", "") for c in columns]
            self.description = [
                (c.get("label") or c.get("name"), c.get("typeName"), None, None, None, None, None)
                for c in columns
            ]
            self._rows = [
                tuple(from_field(f, t) for f, t in zip(record, type_names, strict=True))
                for record in records or []
            ]
            self.rowcount = len(self._rows)
        else:
            self.description = None
            self._rows = []
            self.rowcount = response.get("numberOfRecordsUpdated", -1)

    async def executemany(self, operation: str, seq_of_parameters: Any) -> None:
        total = 0
        for parameters in seq_of_parameters:
            await self.execute(operation, parameters)
            total += max(self.rowcount, 0)
        self.rowcount = total

    async def fetchall(self) -> list[tuple]:
        rows, self._rows = self._rows, []
        return rows

    async def nextset(self) -> None:
        return None

    async def setinputsizes(self, *sizes: Any) -> None:
        return None

    async def close(self) -> None:
        self._rows = []


class AsyncDataApiConnection:
    def __init__(self, client: DataApiClient) -> None:
        self._client = client
        self._transaction_id: str | None = None

    def cursor(self) -> AsyncDataApiCursor:
        return AsyncDataApiCursor(self)

    async def _execute(self, sql: str, parameters: list[dict]) -> dict:
        try:
            if self._transaction_id is None:
                # The first call of a request is where a paused cluster shows up.
                self._transaction_id = await with_resume_retry(self._client.begin_transaction)
            return await with_resume_retry(
                self._client.execute_statement, sql, parameters, self._transaction_id
            )
        except DataApiError as exc:
            raise _translate(exc) from exc

    async def commit(self) -> None:
        transaction_id, self._transaction_id = self._transaction_id, None
        if transaction_id:
            try:
                await self._client.commit_transaction(transaction_id)
            except DataApiError as exc:
                raise _translate(exc) from exc

    async def rollback(self) -> None:
        transaction_id, self._transaction_id = self._transaction_id, None
        if transaction_id:
            try:
                await self._client.rollback_transaction(transaction_id)
            except DataApiError as exc:
                raise _translate(exc) from exc

    async def close(self) -> None:
        await self.rollback()


# --- SQLAlchemy adapters and dialect --------------------------------------------------


class AsyncAdapt_dataapi_cursor(AsyncAdapt_dbapi_cursor):
    __slots__ = ()


class AsyncAdapt_dataapi_connection(AsyncAdapt_dbapi_connection):
    __slots__ = ()
    _cursor_cls = AsyncAdapt_dataapi_cursor


class DataApiDBAPI:
    """Module-like object SQLAlchemy uses as the DBAPI."""

    paramstyle = "named"
    apilevel = "2.0"
    threadsafety = 1
    Error = Error
    InterfaceError = InterfaceError
    DatabaseError = DatabaseError
    DataError = DataError
    OperationalError = OperationalError
    IntegrityError = IntegrityError
    InternalError = InternalError
    ProgrammingError = ProgrammingError
    NotSupportedError = NotSupportedError
    Warning = Warning

    def connect(
        self, client: DataApiClient | None = None, **_: Any
    ) -> AsyncAdapt_dataapi_connection:
        if client is None:
            raise InterfaceError("postgresql+dataapi needs connect_args={'client': ...}")
        return AsyncAdapt_dataapi_connection(self, AsyncDataApiConnection(client))


class PGDialect_dataapi(PGDialect):
    driver = "dataapi"
    is_async = True
    supports_statement_cache = True
    default_paramstyle = "named"
    supports_server_side_cursors = False

    @classmethod
    def import_dbapi(cls) -> DataApiDBAPI:
        return DataApiDBAPI()

    @classmethod
    def get_pool_class(cls, url: Any) -> type:
        return NullPool  # Each request opens and closes its own Data API transaction.

    def create_connect_args(self, url: Any) -> tuple[list, dict]:
        return [], {}  # Everything comes from connect_args (the client).

    def get_driver_connection(self, connection: Any) -> Any:
        return connection._connection

    def do_ping(self, dbapi_connection: Any) -> bool:
        cursor = dbapi_connection.cursor()
        cursor.execute("SELECT 1")
        cursor.close()
        return True


dialect = PGDialect_dataapi
