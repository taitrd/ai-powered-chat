# Local Setup

[← Back to README](../README.md)

You only need Docker.

## Start

```bash
cp .env.example .env
make up          # or: docker compose up -d --build
```

| What | Where | Login |
| :--- | :--- | :--- |
| App | http://localhost:5173 | Dev user, switchable in the sidebar |
| API docs | http://localhost:8000/docs | Dev user |
| pgAdmin (database) | http://localhost:5050 | Already connected |
| Mailpit (emails) | http://localhost:8025 | None |
| S3 file browser | http://localhost:8888 | None (bucket `chat-app-local`) |
| PostgreSQL | `localhost:5432` | `chat` / `chat` |

These tools are for local use only.

- **Database changes:** migrations run automatically when the API starts.
- **Shortcuts:** run `make` to see them all, such as `logs`, `psql` and `reset`.

## Use a real AI

The default `fake` provider returns test replies, so no key is needed. To use Gemini for free, add this to `.env` and restart:

```bash
LLM_DEFAULT=gemini
GEMINI_API_KEY=your-key            # from https://aistudio.google.com/
GEMINI_MODEL=a-flash-model-your-account-offers
```

OpenAI works the same way with `OPENAI_API_KEY` and `OPENAI_MODEL`. Never commit `.env`.

## Main settings

All settings are listed in [`.env.example`](../.env.example).

| Setting | Default | Meaning |
| :--- | :--- | :--- |
| `AUTH_MODE` | `local` | `local` uses dev users, `cognito` uses real sign-in |
| `LLM_DEFAULT` | `fake` | `fake`, `gemini`, `openai` or `claude` |
| `DAILY_USER_MESSAGE_LIMIT` | `30` | Messages per user per day |
| `DAILY_GLOBAL_MESSAGE_LIMIT` | `200` | Messages for everyone per day |

## Tests

```bash
make test                          # backend, with a real PostgreSQL
cd frontend && npm test            # frontend
cd iac && npx cdk synth            # infrastructure
```

Tests never call real AI services.

## Problems

| Problem | Fix |
| :--- | :--- |
| Port already in use | Stop the other app, or change the port in `docker-compose.yml` |
| Gemini says `AuthFailed` | Check `GEMINI_API_KEY` and `GEMINI_MODEL` |
| "Free quota reached" | Wait, or set `LLM_DEFAULT=fake` |
| Strange data after a schema change | `make reset` (deletes local data) |
| Frontend can't find a new package | `docker compose up -d --build --renew-anon-volumes web` |
