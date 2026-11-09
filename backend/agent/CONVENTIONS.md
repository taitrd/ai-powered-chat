# Backend Conventions

Coding rules for the FastAPI backend. Follow them whenever reading, adding, or modifying code.

---

## 1. Architecture Layers

Every feature flows in one direction:
**Schemas → Models & Migration → Repositories → Services → Routes → Tests**

| Layer            | Location                    | Role                            | Allowed                                               | Forbidden                        |
| :--------------- | :-------------------------- | :------------------------------ | :---------------------------------------------------- | :------------------------------- |
| **Schemas**      | `app/api/v1/schemas/`       | Pydantic shapes                 | Input validation, constraints                         | Database models, SQL queries     |
| **Routes**       | `app/api/v1/*.py`           | Thin HTTP handlers              | Request parsing, map domain errors to `HTTPException` | SQL queries, raw business rules  |
| **Services**     | `app/services/`, `app/llm/` | Domain logic & AI orchestration | Business rules, calling repositories & AI adapters    | FastAPI imports, `HTTPException` |
| **Repositories** | `app/repositories/`         | Data access (plain async SQL)   | SQLAlchemy queries via `AsyncSession`                 | Business rules, HTTP concepts    |
| **Models**       | `app/db/models.py`          | SQLAlchemy tables               | Table definitions, indexes, relations                 | Query logic                      |
| **Settings**     | `app/core/config.py`        | Environment settings            | Type-safe settings with defaults                      | Runtime state                    |

---

## 2. Security & Database Rules

- **Authentication:** In `local` mode, `get_current_user` accepts `X-Dev-User`. In `cognito` mode, it validates RS256 JWT access tokens against AWS Cognito JWKS (`token_use="access"`, issuer, client_id, expiration).
- **User Scoping:** Every query in `repositories/` that touches user data **must** filter by `user_id`. Return `None` (routes map this to `404 Not Found`). Never return `403`, to avoid leaking existence.
- **Authenticate Before Database:** Run auth (`get_current_user`) before database queries so invalid traffic never wakes Aurora.
- **No Database During Streams:** Close DB sessions _before_ starting LLM streams. Save assistant replies in a fresh session _before_ emitting `[DONE]`.
- **Stateless Connections:** Use single-request sessions (`Depends(get_session)`). Engine uses `NullPool`.
- **Health Checks:** `/healthz` and `/api/v1/models` must **never** touch the database.

---

## 3. AI Providers (`app/llm/`)

- Implement `LLMProvider` in `app/llm/base.py` yielding `TextDelta` chunks, ending with `StreamEnd`.
- Map provider SDK errors to shared exceptions: `RateLimited`, `AuthFailed`, `Refused`, `Unavailable`.
- Register in `app/llm/providers.yaml`. Active only when credentials are present.
- Read model names from environment variables, never hardcoded.
- Tests must use `fake` provider or mocks. Never call real AI APIs in tests.

---

## 4. Status Codes & Error Handling

- Services raise plain domain exceptions (`LimitExceededError`, `InvalidMessageLengthError`).
- Routes catch domain exceptions and map them to HTTP status codes:
  - `400`: Invalid input or bad cursor.
  - `404`: Not found or owned by another user.
  - `422`: Pydantic validation failure.
  - `429`: Daily message limit exceeded.
  - `503`: Database waking up (`Retry-After`).
- Mid-stream failures are sent as SSE `event: error\ndata: {"error": "..."}\n\n`.

---

## 5. Style & Testing

- Python 3.12+, fully typed, async handlers.
- Lint and format with Ruff: `make lint` (or `.venv/bin/ruff check backend`).
- Run tests against real PostgreSQL in Docker: `make test`.
- Unit test services and repositories directly; integration test routes using the test client.
