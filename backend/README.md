# Backend

FastAPI service for the chat app. It manages conversations, messages, SSE streaming AI replies, and provider models with PostgreSQL persistence.

## Layout

```text
app/
  api/v1/         HTTP routes (conversations, messages, models) and schemas
  repositories/   Data access: plain async SQL functions filtered by user_id
  services/       Business logic: limits, auto-title, SSE stream orchestration
  core/           Settings (config.py) and authentication guards (security.py)
  db/             SQLAlchemy models and sessionmaker (NullPool)
  llm/            AI provider adapters (fake, gemini, openai, claude) and registry
  main.py         FastAPI app entrypoint and /healthz
alembic/          Database migrations
tests/            Pytest test suite (real PostgreSQL in Docker)
```

## Quick Commands

Run from the repository root:

| Command        | What it does                                                                  |
| :------------- | :---------------------------------------------------------------------------- |
| `make up-core` | Start PostgreSQL and the API on `http://localhost:8000` (`/docs` for Swagger) |
| `make test`    | Run pytest against real PostgreSQL test database in Docker                    |
| `make lint`    | Check formatting and linting with Ruff                                        |
| `make migrate` | Apply latest Alembic migrations                                               |
| `make logs`    | Follow API container logs                                                     |

## Authentication

- **Local mode (`AUTH_MODE=local`):** Uses `X-Dev-User: <username>` (defaults to `dev`).
- **Cognito mode (`AUTH_MODE=cognito`):** Requires `Authorization: Bearer <access_token>` validated against AWS Cognito JWKS.

## Documentation

- [`agent/CONVENTIONS.md`](agent/CONVENTIONS.md) — Layer boundaries, ownership rules, and style guidelines.
- [`agent/IMPLEMENTATION.md`](agent/IMPLEMENTATION.md) — Step-by-step checklist for adding a backend feature.
