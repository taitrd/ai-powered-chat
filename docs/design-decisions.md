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
- WebSockets would need API Gateway, a connection store and per-chunk API calls, which adds more code and cost.
- SSE uses the same `Authorization` header, CloudFront route and tests as the REST API.

**Trade-off:** The server can't push messages while idle. The browser's `EventSource` doesn't support POST, so the stream is read with `fetch`.

**Revisit when:** Adding typing indicators, shared live conversations, notifications or voice.

## 3. Multiple AI providers, with Gemini as the default

**Decision:** Use a small adapter interface, with providers listed in `providers.yaml`. One OpenAI-compatible adapter serves both Gemini and OpenAI, and a second adapter serves Claude on Bedrock.

**Why:** Gemini's free tier keeps the demo at $0 for AI. Adding another provider is usually just configuration and a key.

**Trade-off:** Free-tier prompts may be used by Google, and free limits are low. Fallback to another provider is off by default, so it never spends money unexpectedly.

**Not chosen:** LiteLLM and LangChain, which are large dependencies for about 50 lines of code per adapter.

## 4. Zustand for frontend state

**Decision:** Four Zustand stores: `auth`, `conversations`, `chat` and `ui`.

**Why:** It feels like Redux, with stores, actions and selectors, but needs much less code. It also works with Redux DevTools.

**Not chosen:** Redux Toolkit, which needs more boilerplate, and TanStack Query, which would be a second state library.

## 5. Cognito for authentication

**Decision:** Users sign in with Cognito, and the API validates access tokens.

**Why:** It's free for up to 10,000 monthly users, and AWS handles password storage, email verification and token rotation.

## 6. Caching, limits and a daily awake cap

**Decision:** Cache conversations in the browser. Limit messages per user and per day. Pause the API once Aurora has been awake for 3 hours in a UTC day.

**Why:** Aurora bills for the time it's awake, not for each query, and every wake lasts at least 5 minutes. Caching avoids wakes, and the cap limits the worst case.

**Trade-off:** Changes made on another device can take up to 1 hour to appear. Once the cap is reached, chat stops until the next UTC day.

**Not chosen:** Caching AI replies, CloudFront caching for the API (risk of showing private data), and Redis (costs more than it saves).

## 7. AWS CDK in TypeScript

**Decision:** Define all infrastructure in CDK, split into five small stacks.

**Why:** High-level constructs keep the code short and readable for beginners, and one command deploys everything. The database stack is separate and retained, so app deploys can't delete data.

## Cost summary

| Scenario | Approx. AWS cost per month |
| :--- | :--- |
| Idle | ~$0.75 (storage, DNS, images) |
| Light demo use | ~$2 |
| Daily awake cap reached every day | ~$7–13 |
| Growth: Fargate + ALB, database always on | ~$55–100 |

These are estimates, so confirm them in the AWS Pricing Calculator. The domain fee and any paid AI usage are extra.
