# Local Setup

[← Back to README](../README.md)

> Describes the planned setup. Commands work once milestone M1 is finished.

## Requirements

- Docker Desktop, or Docker with Compose
- Node.js 22 and Python 3.12, only for running tests outside Docker

## Run the app in 3 steps

```bash
# 1. Create your settings file
cp .env.example .env

# 2. Start PostgreSQL, the API and the frontend
docker compose up --build

# 3. Open the app
open http://localhost:5173
```

| Service | URL |
| :--- | :--- |
| Frontend (added in M3) | http://localhost:5173 |
| API | http://localhost:8000, with interactive docs at http://localhost:8000/docs |
| PostgreSQL | `localhost:5432` (user `chat`, password `chat`) |

Database migrations run automatically when the API starts locally.

Locally, sign-in uses a development user instead of Cognito (`AUTH_MODE=local`). The API refuses to start with this setting in production. Requests are made as the user `dev` by default, and the `X-Dev-User` header acts as someone else:

```bash
curl -X POST localhost:8000/api/v1/conversations -H 'Content-Type: application/json' -d '{"title":"Hello"}'
curl localhost:8000/api/v1/conversations -H 'X-Dev-User: alice'   # Alice sees only her own chats
```

## Use a real AI provider

By default, `LLM_DEFAULT=fake` returns test replies, so no key is needed. To use Gemini for free:

1. Create an API key in [Google AI Studio](https://aistudio.google.com/).
2. Set these values in `.env`:
   ```bash
   LLM_DEFAULT=gemini
   GEMINI_API_KEY=your-key
   GEMINI_MODEL=a-flash-model-your-account-offers
   ```
3. Restart with `docker compose up`.

OpenAI works the same way with `OPENAI_API_KEY` and `OPENAI_MODEL`. Claude on Bedrock uses your AWS credentials and `BEDROCK_ENABLED=true`.

**Never commit `.env`.** It's already in `.gitignore`.

## Environment variables

| Variable | Local default | Purpose |
| :--- | :--- | :--- |
| `APP_ENV` | `local` | `local` or `prod` |
| `AUTH_MODE` | `local` | `local` uses a development user, `cognito` validates real JWTs |
| `DATABASE_URL` | `postgresql+asyncpg://chat:chat@db:5432/chat` | Database connection |
| `DB_AUTH_MODE` | `password` | `password` locally, `iam` on AWS |
| `LLM_DEFAULT` | `fake` | Default provider: `fake`, `gemini`, `openai` or `claude` |
| `LLM_FALLBACKS` | empty | Providers to try if the default is rate-limited, such as `openai,claude` |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | empty | Enable Gemini |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | empty | Enable OpenAI |
| `BEDROCK_ENABLED`, `BEDROCK_MODEL_ID` | `false`, `anthropic.claude-haiku-5-5` | Enable Claude on Bedrock |
| `AWS_REGION` | `us-east-1` | Region for Bedrock |
| `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` | empty | Required when `AUTH_MODE=cognito` |
| `MAX_MESSAGE_CHARS` | `4000` | Longest message a user can send |
| `MAX_OUTPUT_TOKENS` | `8000` | Longest reply |
| `DAILY_USER_MESSAGE_LIMIT` | `30` | Messages per user per day |
| `DAILY_GLOBAL_MESSAGE_LIMIT` | `200` | Messages across all users per day |

## Run tests

```bash
# Backend (uses the Compose PostgreSQL and the fake AI provider)
docker compose run --rm api pytest

# Frontend
cd frontend && npm install && npm test

# Infrastructure
cd iac && npm install && npx cdk synth
```

Tests never call real AI APIs, so they use no quota and cost nothing.

## Common problems

| Problem | Fix |
| :--- | :--- |
| Port already in use | Stop the other service, or change the port in `docker-compose.yml` |
| `AuthFailed` from Gemini | Check `GEMINI_API_KEY` and that `GEMINI_MODEL` exists for your account |
| `429` with "free quota reached" | Wait for the Gemini quota to reset, or switch to `LLM_DEFAULT=fake` |
| Old data after schema changes | Reset the database with `docker compose down -v` (deletes local data) |
