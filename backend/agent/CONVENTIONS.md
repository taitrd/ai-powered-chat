# Backend Conventions

Rules for changing the FastAPI backend in `chat-app`. Follow them when adding or editing code. They apply to AI coding agents and people alike.

## 1. Layers

Every feature follows the same path:

**Schemas → Models and migration → Services → Routes → Tests**

The steps are in [`IMPLEMENTATION.md`](IMPLEMENTATION.md).

| Layer | Location | Job |
| :--- | :--- | :--- |
| Schemas | `app/api/v1/schemas.py` | Pydantic request and response models. Validate input here, for example length and whitespace. |
| Models | `app/db/models.py` | SQLAlchemy tables |
| Migrations | `alembic/versions/` | One migration per schema change. Never edit an applied migration. |
| Services | `app/llm/`, plus `app/services/` when needed | Logic that isn't HTTP-specific: AI providers, limits, formatting |
| Routes | `app/api/v1/*.py` | Thin handlers: check access, call services, return schemas |
| Settings | `app/core/config.py` | Every environment variable, typed, with a safe default |

## 2. Data access and security

- **Scope every query to the user:** filter every query by the current user. Load conversations through `_get_owned_conversation`, which returns `404` for another user's data. Never return `403`, because it would reveal that the data exists.
- **Authenticate first:** run `get_current_user` before any database access. Unauthenticated traffic must never wake Aurora.
- **Short connections:** use one `AsyncSession` per request through `Depends(get_session)`. The engine uses `NullPool`, so don't add connection pools or background tasks that hold connections.
- **No database during streams:** close the session before streaming an AI reply, then save the reply with a new session before sending `[DONE]`.
- **No database in health checks:** `/healthz` and `/api/v1/models` must not touch the database.
- **Safe SQL:** use SQLAlchemy expressions or bound parameters, never string-built SQL.

## 3. AI providers

- Every provider implements `LLMProvider` in `app/llm/base.py` and yields `TextDelta`, then one `StreamEnd`.
- Convert provider errors to the shared errors: `RateLimited`, `AuthFailed`, `Refused` or `Unavailable`. Never leak SDK exceptions to routes.
- Add providers in `app/llm/providers.yaml`. A provider is active only when its credentials are set.
- Read model IDs from environment variables. Don't hardcode them in Python.
- Tests use the `fake` provider or mocked HTTP. Never call a real AI API from tests.

## 4. Settings and secrets

- Add each new environment variable to `Settings`, `.env.example`, `docker-compose.yml` and `docs/local-setup.md`.
- Unsafe combinations must fail at startup, for example `AUTH_MODE=local` with `APP_ENV=prod`. Add a test for each one.
- Never commit secrets, and never log API keys or tokens.

## 5. Errors and responses

- Use `HTTPException` with a short `detail` message the frontend can show.
- **Status codes:**
  - `404` for missing or other users' data.
  - `422` for invalid input, returned automatically by FastAPI.
  - `429` for limits.
  - `503` with `Retry-After` while the database resumes.
- After a stream has started, send errors as an SSE `event: error`, not an HTTP status.

## 6. Style and tests

- Python 3.12, fully typed, `async` handlers.
- Ruff checks lint and formatting, with a line length of 100. Run `make lint`.
- Every endpoint needs tests for:
  - The success case.
  - Validation errors.
  - `404` for another user's data.
- Tests run against real PostgreSQL in Docker (`make test`), never SQLite.
