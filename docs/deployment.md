# Deployment

[← Back to README](../README.md)

This guide covers deploying the application to AWS using AWS CDK.

## Prerequisites

| Item                  | Notes                                                                  |
| :-------------------- | :--------------------------------------------------------------------- |
| AWS account           | Dedicated budget alert recommended                                     |
| IAM credentials       | Admin permissions to bootstrap CDK and provision resources (see below) |
| Node.js 22 and Docker | Used by CDK to build the Lambda container image                        |
| Domain (optional)     | Hosted in Route 53 for custom domain and HTTPS                         |
| Gemini API key        | Free tier from [Google AI Studio](https://aistudio.google.com/)        |

All stacks deploy to **`us-east-1`** to align ACM certificates, API Gateway, and backend infrastructure.

### AWS Credentials & Permissions

To bootstrap CDK and deploy all stacks, the executing AWS user or role requires **`AdministratorAccess`** (or permissions across CloudFormation, IAM, VPC, RDS, Secrets Manager, Lambda, ApiGatewayV2, Cognito, Route 53, ACM, SSM, and CloudWatch).

#### Setting up credentials in `.env`:

1. In the **AWS IAM Console** → **Users** → create a user with CLI access and attach the `AdministratorAccess` policy.
2. Under **Security credentials**, create an **Access Key**.
3. Add the keys to your root `.env` file:
   ```ini
   AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
   AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
   AWS_DEFAULT_REGION=us-east-1
   ```

_Tip: CDK commands run via `npm run cdk -- <command>` inside `iac/` will automatically load credentials from this `.env` file._

### Architecture Note: API Gateway HTTP API (No CloudFront Verification Block)

Unlike CloudFront (which frequently blocks new or unverified AWS accounts with `Access denied: Your account must be verified before you can add new CloudFront resources`), this application uses **API Gateway HTTP API v2** with Route 53 and ACM. It requires no support verification tickets, has $0 idle cost, supports streaming responses, and cleanly serves both the React SPA and FastAPI backend under your custom domain.

## Stacks

| Stack      | Creates                                                                               | Dependencies           |
| :--------- | :------------------------------------------------------------------------------------ | :--------------------- |
| `ChatAuth` | Cognito User Pool and public web client                                               | None                   |
| `ChatData` | Aurora PostgreSQL Serverless v2 cluster with IAM authentication                       | None                   |
| `ChatApi`  | FastAPI Lambda container, streaming Function URL, and daily awake guard               | `ChatAuth`, `ChatData` |
| `ChatWeb`  | API Gateway HTTP API, Custom Domain (`aichat.taitrd.com`), Route 53 A-record, ACM SSL | `ChatApi`              |
| `ChatCicd` | GitHub OIDC identity provider and deployment role                                     | None                   |

### Deploying a Single Stack

You can deploy or update stacks individually rather than running `deploy --all`:

```bash
cd iac

# Deploy Cognito authentication only:
npm run cdk -- deploy ChatAuth

# Deploy Aurora PostgreSQL cluster only:
npm run cdk -- deploy ChatData

# Deploy or update FastAPI backend Lambda (re-builds Docker container):
npm run cdk -- deploy ChatApi

# Deploy or update Frontend website (requires 'npm run build' in frontend first):
npm run cdk -- deploy ChatWeb

# Deploy GitHub CI/CD OIDC role only:
npm run cdk -- deploy ChatCicd
```

> **Note:** If deploying for the first time, follow the dependency order: `ChatAuth` & `ChatData` → `ChatApi` → `ChatWeb`.

## First Deployment

### 1. Configure

Edit `iac/cdk.json` with your domain and GitHub repo (or leave domain empty for default API Gateway URL):

```json
{
  "context": {
    "domainName": "chat.example.com",
    "hostedZoneName": "example.com",
    "githubRepo": "owner/repo",
    "awakeCapHours": 3
  }
}
```

### 2. Bootstrap CDK (once per account)

```bash
cd iac && npm install
npm run cdk -- bootstrap aws://<ACCOUNT_ID>/us-east-1
```

_(Note: `npm run cdk` automatically loads your `.env` credentials)._

### 3. Store AI Keys in SSM

Use the helper script to store keys in AWS SSM Parameter Store (it auto-loads `.env` and uses the project's AWS CLI):

```bash
# Default: stores GEMINI_API_KEY from .env under /chat-app/prod/GEMINI_API_KEY
./backend/scripts/set-ssm.sh

# Pass custom key name and value:
./backend/scripts/set-ssm.sh GEMINI_API_KEY "<your-key>"
./backend/scripts/set-ssm.sh OPENAI_API_KEY "<your-key>"
./backend/scripts/set-ssm.sh /custom/ssm/path "<value>"
```

Or run the AWS CLI directly:

```bash
aws ssm put-parameter --region us-east-1 --type SecureString \
  --name /chat-app/prod/GEMINI_API_KEY --value "<your-gemini-key>" --overwrite
```

### 4. Create Database and Run Migrations

```bash
# 1. Deploy the Aurora PostgreSQL cluster
cd iac && npm run cdk -- deploy ChatData

# 2. Initialize the 'app' database user with IAM auth
# Connect as postgres (retrieve password from Secrets Manager) and execute:
psql -h <CLUSTER_ENDPOINT> -p 5432 -U postgres -d chat -f ../backend/scripts/init-user.sql

# 3. Run Alembic migrations against the cluster
cd ../backend && ./scripts/migrate.sh prod
```

### 5. Build Frontend and Deploy Everything

```bash
cd iac
# Builds production frontend and packages into backend container:
npm run sync-frontend
# Deploys backend API and custom domain on aichat.taitrd.com:
npm run cdk -- deploy ChatApi ChatWeb
```

### 6. Verify

```bash
curl https://<domain-or-apigw-url>/healthz
```

Visit the frontend URL in your browser, register an account, and send a test message.

## CI/CD with GitHub Actions

![CI/CD Pipeline](diagrams/ci-pipeline.png)

<sub>Source: [`ci-pipeline.mmd`](diagrams/ci-pipeline.mmd) and [`cicd-oidc.mmd`](diagrams/cicd-oidc.mmd)</sub>

1. Deploy `ChatCicd` once: `cd iac && npm run cdk -- deploy ChatCicd`.
2. In GitHub repository **Settings → Secrets and variables → Actions → Variables**, add:
   - `AWS_ROLE_ARN`: the role ARN from `ChatCicd` output (e.g. `arn:aws:iam::141058755356:role/chat-app-github-deploy-role`)
   - `AWS_REGION`: `us-east-1`
3. Workflows:
   - **Pull requests (`test.yml`)**: Runs Ruff lint, Pytest with PostgreSQL service container, frontend build/tests, and CDK synth.
   - **Pushes to `main` (`deploy.yml`)**: Authenticates via AWS OIDC (no stored AWS keys), builds the production frontend SPA, deploys all CDK stacks, and smoke tests the live health URL.

## Day-to-Day Operations

| Task                 | Command / Action                                                                                |
| :------------------- | :---------------------------------------------------------------------------------------------- |
| **Rollback**         | Redeploy previous commit or Git revert                                                          |
| **Raise awake cap**  | Update `awakeCapHours` in `iac/cdk.json` and deploy `ChatApi`                                   |
| **Resume after cap** | Wait for next UTC day or run: `aws lambda delete-function-concurrency --function-name <api-fn>` |
| **View logs**        | CloudWatch → Log groups → `/aws/lambda/<api-fn>`                                                |
| **Restore backup**   | RDS console → Aurora cluster → **Restore to point in time**                                     |

## Tear Down

```bash
cd iac && npm run cdk -- destroy --all
```

_Note: Aurora cluster data and S3 backups are retained to prevent accidental data loss. Delete them manually in the AWS Console if no longer needed._
