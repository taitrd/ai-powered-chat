# Design Decisions

[← Back to README](../README.md)

The main choices, why they were made, and when to revisit them. Details are in [`PLAN.md`](../PLAN.md).

## 1. Lambda + Aurora Serverless

- **Choice:** FastAPI runs on Lambda, and the database is Aurora PostgreSQL, which pauses when idle.
- **Why:** You pay almost nothing while nobody uses the app.
- **Trade-off:** The first request after a quiet period waits 15–30 seconds while the database wakes up.
- **Revisit when:** Real users need instant replies.

| Alternative | Monthly cost | Why not |
| :--- | :--- | :--- |
| EC2 with Docker | ~$11.50 | Fixed cost, and we'd manage backups |
| Fargate + RDS | ~$55 | Too costly for a demo |

## 2. API Gateway REST API with streaming

- **Choice:** One REST API serves both the website and the API through the Lambda.
- **Why:**
  - Replies stream token by token, for up to 5 minutes.
  - It avoids CloudFront, which this AWS account isn't verified for.
- **Why not an HTTP API:** an HTTP API can't stream and stops after about 30 seconds. It was tried first, and replies went missing.
- **Trade-off:** Files come from Lambda instead of a global CDN, which is fine at demo scale.

## 3. SSE instead of WebSockets

- **Choice:** Replies stream as Server-Sent Events over a normal HTTP response.
- **Why:** Chat only needs the server to stream one reply per message. SSE works with the same login header and routes as the rest of the API. WebSockets would need an extra API Gateway type and more code.
- **Revisit when:** Adding typing indicators, live shared chats or voice.

## 4. Several AI providers, Gemini by default

- **Choice:** A small adapter per provider. Gemini and OpenAI share one adapter, and Claude on Bedrock has another.
- **Why:** Gemini's free tier keeps AI at $0, and adding a provider is mostly configuration.
- **Trade-off:** Google may use free-tier prompts. Falling back to a paid provider is off by default.

## 5. Redux Toolkit

- **Choice:** Four slices (`auth`, `conversations`, `chat`, `ui`). Only thunks call the API.
- **Why:** The team knows Redux, and the structure is easy to follow (see [`frontend/agent/CONVENTIONS.md`](../frontend/agent/CONVENTIONS.md)).

## 6. Cognito

- **Choice:** Users sign in with Cognito.
- **Why:** It's free up to 10,000 monthly users, and AWS handles passwords and email checks.

## 7. Caching and limits

- **Choice:**
  - Cache chats in the browser.
  - Limit messages per user and per day.
  - Pause chat once the database has been awake for 3 hours in a day.
- **Why:** The database bills for time awake, so fewer wake-ups means a lower bill, and the cap limits the worst case.
- **Trade-off:** Another device's changes can take up to an hour to show, and chat pauses until the next day once the cap is hit.

## 8. AWS CDK

- **Choice:** All infrastructure is in five small CDK stacks.
- **Why:** The code is short, and one command deploys everything. The database stack is separate, so app deploys can't delete data.

## Monthly cost

| Usage | AWS cost |
| :--- | :--- |
| Idle | ~$0.75 |
| Light demo use | ~$2 |
| Daily cap hit every day | ~$7–13 |

These are estimates. The domain and any paid AI usage are extra.
