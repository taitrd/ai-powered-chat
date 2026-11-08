# Lightweight AI Chat

A small AI chat app with saved conversations, user accounts and streaming replies. It runs on AWS for about $2 a month at demo usage.

> **Status: in development.** These documents describe the planned design in [`PLAN.md`](PLAN.md). Commands and URLs become real as each milestone is finished.

**Live demo:** `https://chat.<your-domain>` (available after milestone M5)

<!-- After the repository exists, add the CI badge:
![CI](https://github.com/<owner>/<repo>/actions/workflows/test.yml/badge.svg) -->

## Features

- Chat with streamed, token-by-token replies.
- Create, rename, delete and revisit conversations.
- Sign up and sign in with Cognito. Each user sees only their own chats.
- Choose an AI provider: Gemini (default, free tier), ChatGPT, or Claude.
- Responsive layout with loading states, clear errors and a stop button.

## Tech stack

| Part | Technology |
| :--- | :--- |
| Frontend | React, TypeScript, Vite, Tailwind CSS, Redux Toolkit |
| Backend | Python, FastAPI, running on AWS Lambda |
| Database | Aurora PostgreSQL Serverless, which pauses when idle |
| Auth | Amazon Cognito |
| Hosting | S3 and CloudFront, with Route 53 and ACM for the domain and HTTPS |
| IaC and CI/CD | AWS CDK (TypeScript), GitHub Actions |

## Documentation

| Document | What it covers |
| :--- | :--- |
| [Architecture](docs/architecture.md) | Diagram, how requests flow, and security |
| [Local setup](docs/local-setup.md) | Run the app and tests on your machine |
| [Deployment](docs/deployment.md) | Deploy to AWS with a custom domain |
| [Design decisions](docs/design-decisions.md) | Why each choice was made, and what it costs |
| [Project plan](PLAN.md) | Full plan and milestones |

## Quick start

```bash
cp .env.example .env
docker compose up --build
```

Then open the API docs at http://localhost:8000/docs. The web app at http://localhost:5173 arrives in milestone M3. No AI key is needed: the default `fake` provider returns test replies. See [Local setup](docs/local-setup.md) to use a real AI provider.

## Good to know

- **First request can be slow:** after a quiet period, the first request can take 15–30 seconds while the database resumes. The app shows a message while it waits.
- **Daily limits:** there are daily message limits and a daily cap on database awake time, so the demo may pause until the next UTC day.
- **Gemini free tier:** Google may use prompts sent on the free tier to improve its products. Don't enter sensitive information.

## Repository layout

```text
backend/    FastAPI app, AI provider adapters, tests   → see backend/README.md
frontend/   React app and Redux Toolkit store          → see frontend/README.md
iac/        AWS CDK stacks
docs/       Short guides linked above
.github/    CI/CD workflows
```

Each of `backend/` and `frontend/` has an `agent/` folder with coding conventions and feature steps, for AI coding agents and new developers.
