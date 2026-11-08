# Backend

FastAPI service for the chat app. It provides conversations, messages, streamed AI replies (SSE) and the provider list, and stores data in PostgreSQL. It runs in Docker locally and on AWS Lambda in production.

## Agent and contributor docs

Read these before changing backend code:

| Document | What it covers |
| :--- | :--- |
| [`agent/CONVENTIONS.md`](agent/CONVENTIONS.md) | Layer rules, data access and security, AI providers, settings, errors, style |
| [`agent/IMPLEMENTATION.md`](agent/IMPLEMENTATION.md) | Step-by-step guide for adding an endpoint or resource |

Project-wide docs: [architecture](../docs/architecture.md), [local setup](../docs/local-setup.md), [deployment](../docs/deployment.md), [design decisions](../docs/design-decisions.md) and the [plan](../PLAN.md).

## Commands

Run these from the repository root. They use Docker, so you don't need a local Python setup.

| Command | What it does |
| :--- | :--- |
| `make up-core` | Start PostgreSQL and the API on http://localhost:8000, with docs at `/docs` |
| `make test` | Run pytest against a real PostgreSQL test database |
| `make lint` | Check lint and formatting with Ruff |
| `make migrate` | Apply Alembic migrations |
| `make logs` | Follow API logs |

Locally, requests are made as the user `dev`. Add the header `X-Dev-User: alice` to act as another user.

## Layout

```text
app/
  api/v1/chat.py     Conversation, message, models and SSE endpoints
  api/v1/schemas.py  Request and response models
  core/config.py     Settings from environment variables
  core/security.py   Current-user dependency (local dev users now, Cognito in M4)
  db/models.py       SQLAlchemy models
  db/session.py      Engine with NullPool, per-request sessions
  llm/               Provider interface, registry, adapters, providers.yaml
  main.py            App factory and /healthz
alembic/             Migrations
tests/               pytest suite (real PostgreSQL, fake AI provider)
```
