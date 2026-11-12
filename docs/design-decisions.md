# Design Decisions

[← Back to README](../README.md)

Short records of the main choices, and when to revisit them. The full reasoning is in [`PLAN.md`](../PLAN.md).

## 1. Lambda + Aurora Serverless for hosting

**Decision:** Run FastAPI on Lambda, and use an Aurora PostgreSQL express cluster that pauses when idle.

**Why:** It's the closest AWS option to pay-as-you-go. Both compute and database cost almost nothing while idle, and running without a VPC avoids NAT Gateway charges.

| Option | Approx. monthly cost | Why not chosen |
| :--- | :--- | :--- |
| EC2 with Docker | ~$11.50 | Fixed cost, and we'd handle backups ourselves. This is the fallback if M0 fails. |
| Lambda + RDS | ~$15–20 | RDS never pauses, and a Lambda in a VPC needs a NAT to reach Gemini |
| Fargate + ALB + RDS | ~$55 | Good for steady traffic, too costly for a demo |
| App Runner | — | Closed to new customers since April 30, 2026 |

**Trade-off:** The first request after idle waits 15–30+ seconds. The database endpoint is reachable from the internet and protected by IAM login.

**Revisit when:** Real users need instant responses, or the database is awake for more than about 160 hours a month.

## 2. SSE instead of WebSockets

**Decision:** Stream replies with Server-Sent Events over a normal HTTP response.

**Why:** Chat needs one-way streaming: the browser sends a message, and the server streams one reply.

- Lambda Function URLs support streaming responses, but not WebSockets.
- WebSockets would need API Gateway WebSocket APIs, a connection store and per-chunk API calls, which adds more code and cost.
- SSE uses the same `Authorization` header, API Gateway HTTP route and tests as the REST API.

**Trade-off:** The server can't push messages while idle. The browser's `EventSource` doesn't support POST, so the stream is read with `fetch`.

**Revisit when:** Adding typing indicators, shared live conversations, notifications or voice.

## 3. Multiple AI providers, with Gemini as the default

**Decision:** Use a small adapter interface, with providers listed in `providers.yaml`. One OpenAI-compatible adapter serves both Gemini and OpenAI, and a second adapter serves Claude on Bedrock.

**Why:** Gemini's free tier keeps the demo at $0 for AI. Adding another provider is usually just configuration and a key.

**Trade-off:** Free-tier prompts may be used by Google, and free limits are low. Fallback to another provider is off by default, so it never spends money unexpectedly.

**Not chosen:** LiteLLM and LangChain, which are large dependencies for about 50 lines of code per adapter.

## 4. Redux Toolkit for frontend state

**Decision:** Four Redux Toolkit slices: `auth`, `conversations`, `chat` and `ui`. API calls happen only in async thunks.

**Why:** The team already knows Redux. Slices, thunks and Redux DevTools give a predictable structure that new developers and AI coding agents can follow (see [`frontend/agent/CONVENTIONS.md`](../frontend/agent/CONVENTIONS.md)).

**Trade-off:** More code than Zustand, and about 10 KB more JavaScript after compression. State must stay serializable, so the stream's `AbortController` lives outside the store.

**Not chosen:** Zustand, which was used first and replaced for familiarity, and TanStack Query, which would be a second state library.

## 5. Cognito for authentication

**Decision:** Users sign in with Cognito, and the API validates access tokens.

**Why:** It's free for up to 10,000 monthly users, and AWS handles password storage, email verification and token rotation.

## 6. Caching, limits and a daily awake cap

**Decision:** Cache conversations in the browser. Limit messages per user and per day. Pause the API once Aurora has been awake for 3 hours in a UTC day.

**Why:** Aurora bills for the time it's awake, not for each query, and every wake lasts at least 5 minutes. Caching avoids wakes, and the cap limits the worst case.

**Trade-off:** Changes made on another device can take up to 1 hour to appear. Once the cap is reached, chat stops until the next UTC day.

**Not chosen:** Caching AI replies, edge caching for the API (risk of exposing private conversation data), and Redis (costs more than it saves).

## 7. AWS CDK in TypeScript

**Decision:** Define all infrastructure in CDK, split into five small stacks.

**Why:** High-level constructs keep the code short and readable for beginners, and one command deploys everything. The database stack is separate and retained, so app deploys can't delete data.

## 8. API Gateway HTTP API instead of CloudFront + S3

**Decision:** Route all traffic through API Gateway HTTP API to Lambda, and bundle the frontend SPA directly into the FastAPI container.

**Why:**
- Bypasses CloudFront's account verification block without needing AWS support tickets.
- Keeps 100% of the app inside AWS at $0 idle cost.
- Preserves token-by-token response streaming for AI chat.
- Ships as a single Docker image with no S3 bucket policies or CDN cache invalidation steps.

**Trade-off:** Static files are served by Lambda instead of global CDN edges. Browser caching handles repeat visits.

**Revisit when:** High global traffic volume justifies a multi-region CDN once CloudFront verification is available.

## Cost summary

| Scenario | Approx. AWS cost per month |
| :--- | :--- |
| Idle | ~$0.75 (storage, DNS, images) |
| Light demo use | ~$2 |
| Daily awake cap reached every day | ~$7–13 |
| Growth: Fargate + ALB, database always on | ~$55–100 |

These are estimates, so confirm them in the AWS Pricing Calculator. The domain fee and any paid AI usage are extra.
