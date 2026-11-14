# Deployment

[← Back to README](../README.md)

Deploy everything to AWS `us-east-1` with CDK.

## Before you start

- **AWS credentials** with admin rights, in `.env.iac` at the repository root. Every `npm run cdk` command loads this file:
  ```ini
  AWS_ACCESS_KEY_ID=...
  AWS_SECRET_ACCESS_KEY=...
  AWS_DEFAULT_REGION=us-east-1
  ```
  Never commit this file. Short-lived credentials from `aws configure sso` are safer than long-lived access keys.
- **Tools:** Node.js 22 and Docker. CDK builds the Lambda image locally.
- **Domain:** a domain in Route 53 (optional).
- **Gemini key:** a free API key from [Google AI Studio](https://aistudio.google.com/).

## Stacks

| Stack | Creates |
| :--- | :--- |
| `ChatAuth` | Cognito user pool and web client |
| `ChatData` | Aurora PostgreSQL. Kept even if the stack is deleted. |
| `ChatApi` | FastAPI Lambda, with the frontend built in, and the daily awake guard |
| `ChatWeb` | API Gateway REST API with streaming, custom domain, DNS record |
| `ChatCicd` | GitHub deploy role (OIDC) |

## First deployment

```bash
cd iac && npm install

# 1. Set domainName, hostedZoneName and githubRepo in iac/cdk.json, then bootstrap once per account
npm run cdk -- bootstrap aws://<ACCOUNT_ID>/us-east-1

# 2. Store the Gemini key in SSM (reads GEMINI_API_KEY from .env)
../backend/scripts/set-ssm.sh

# 3. Create the database and run migrations (through the RDS Data API)
npm run cdk -- deploy ChatAuth ChatData
cd ../backend && python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
set -a; . ../.env.iac; set +a
./scripts/migrate.sh prod
cd ../iac

# 4. Build the frontend into the backend image, then deploy the app
npm run sync-frontend
npm run cdk -- deploy ChatApi ChatWeb

# 5. Check
curl https://<your-domain>/healthz
```

Then open the site, sign up, and send a message.

**The database is private:** it has no public IP and accepts no direct connections. The app and migrations both reach it through the **RDS Data API** over HTTPS. You only run step 3 by hand for the very first deployment: after that, **every GitHub Actions deploy runs migrations automatically**, before the new app version goes live. For ad-hoc SQL, use the RDS console's **Query editor**, which also uses the Data API.

- **Postgres password:** for step 3, it's in Secrets Manager.
- **Updating one stack:** deploy it by name, for example `npm run cdk -- deploy ChatApi`.

## CI/CD with GitHub Actions

![CI/CD Pipeline](diagrams/ci-pipeline.png)

1. **Add the repository IDs to `iac/cdk.json`.** Get them with `curl -s https://api.github.com/repos/<owner>/<repo>`: `owner.id` goes in `githubOwnerId`, and `id` goes in `githubRepoId`.
   GitHub repos created after July 15, 2026 include these IDs in their sign-in tokens. Without them, deploys fail with `Not authorized to perform sts:AssumeRoleWithWebIdentity` ([details](https://github.blog/changelog/2026-04-23-immutable-subject-claims-for-github-actions-oidc-tokens/)).
2. **Deploy the role from your machine:** `npm run cdk -- deploy ChatCicd`. It only trusts pushes to `main` of this repository.
3. **Add Actions variables** under Settings → Secrets and variables → Actions → Variables:

   | Variable | Value |
   | :--- | :--- |
   | `AWS_ROLE_ARN` | `DeployRoleArn` output of `ChatCicd` |
   | `AWS_REGION` | `us-east-1` |
   | `VITE_COGNITO_CLIENT_ID` | `UserPoolClientId` output of `ChatAuth` (required) |
   | `VITE_AUTH_MODE` | `cognito`, which is also the default |

   `VITE_*` values are built into the public JavaScript, so never put secrets in them.

Pull requests run the tests. Pushes to `main` test, deploy, and check `/healthz`.

## Operations

| Task | How |
| :--- | :--- |
| Roll back | Revert the commit and push |
| Raise the daily awake cap | Change `awakeCapHours` in `iac/cdk.json`, then deploy `ChatApi` |
| Resume after the cap | Wait for the next UTC day, or run `aws lambda delete-function-concurrency --function-name <api-fn>` |
| View logs | CloudWatch → `/aws/lambda/<api-fn>` |
| Restore data | RDS console → cluster → **Restore to point in time** |
| Remove everything | `npm run cdk -- destroy --all`. The database is kept, so delete it in the console if you're sure. |
