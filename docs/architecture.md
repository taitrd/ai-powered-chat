# Architecture

[← Back to README](../README.md)

> Describes the planned design. See [`PLAN.md`](../PLAN.md) for details.

## Overview

![Architecture overview](diagrams/architecture.png)

<sub>Source: [`architecture.mmd`](diagrams/architecture.mmd)</sub>

| Part | Job |
| :--- | :--- |
| **CloudFront** | The single public entry point. It serves the website from S3 and forwards `/api/*` to Lambda. |
| **Lambda** | Runs the FastAPI container. It scales to zero when unused. |
| **Aurora** | Stores users, conversations and messages. It pauses after 5 idle minutes. |
| **Cognito** | Handles sign-up, sign-in and tokens. |
| **AI provider** | Generates replies. Gemini is the default, and others are enabled by configuration. |
| **Awake guard** | A small scheduled Lambda that limits how long Aurora runs each day. |

## Request flows

### Opening the app

1. CloudFront serves the React app from S3.
2. The app shows conversations cached in the browser right away.
3. It calls the API only if the cache is missing or more than 1 hour old, which keeps the database asleep when possible.

### Sending a message

![Sending a message](diagrams/send-message.png)

<sub>Source: [`send-message.mmd`](diagrams/send-message.mmd)</sub>

- **Waking the database:** if Aurora is paused, the API retries for up to 45 seconds while it resumes. The browser shows a "waking up" message.
- **Heartbeat:** a ping every 15 seconds keeps CloudFront from closing a quiet stream.
- **Save order:** the reply is saved before `[DONE]` is sent, because Lambda can freeze once the response ends.

## Security

| Boundary | Protection |
| :--- | :--- |
| Browser to CloudFront | HTTPS only, with an ACM certificate |
| CloudFront to Lambda | HTTPS, plus a secret origin header so direct calls to the Lambda URL are rejected |
| Every API request | Cognito JWT checked before any database access |
| User data | Every query is filtered by the signed-in user. Another user's chat returns `404`. |
| Lambda to Aurora | Short-lived IAM tokens over TLS, with no stored password. The database endpoint is internet-reachable, so it relies on IAM rather than a private network. |
| Secrets | AI keys are kept in SSM Parameter Store, never in code or images |
| GitHub to AWS | OIDC role limited to this repository's `main` branch, with no stored AWS keys |
| Cost | Message limits, a daily cap on database awake time, and a budget alert |

## Data model

![Data model](diagrams/data-model.png)

<sub>Source: [`data-model.mmd`](diagrams/data-model.mmd)</sub>

Deleting a conversation also deletes its messages.
