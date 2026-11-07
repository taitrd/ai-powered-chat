# Deployment

[← Back to README](../README.md)

> Describes the planned deployment. Steps become final after milestones M0 and M5.

## Prerequisites

| Item | Notes |
| :--- | :--- |
| AWS account | Set a budget alert first, even though CDK also creates one |
| AWS CLI v2 | Signed in with an admin profile, for example through `aws configure sso` |
| Node.js 22 and Docker | CDK builds the Lambda container image locally |
| A domain | Registered in Route 53, or delegated to a Route 53 hosted zone |
| Gemini API key | Free from [Google AI Studio](https://aistudio.google.com/) |

Everything deploys to **`us-east-1`**. This keeps the CloudFront certificate and the app in one region.

## Stacks

| Stack | Creates |
| :--- | :--- |
| `ChatAuth` | Cognito user pool and app client |
| `ChatData` | Aurora PostgreSQL express cluster, kept even if the stack is deleted |
| `ChatApi` | Lambda container, Function URL and awake guard |
| `ChatWeb` | S3, CloudFront, ACM certificate, DNS records and the frontend's `config.json` |
| `ChatCicd` | GitHub OIDC provider and deploy role |

## First deployment

### 1. Configure

Edit `iac/cdk.json`:

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
npx cdk bootstrap aws://<ACCOUNT_ID>/us-east-1
```

### 3. Store the AI key

```bash
aws ssm put-parameter --region us-east-1 --type SecureString \
  --name /chat-app/prod/GEMINI_API_KEY --value "<your-key>"
```

Add `OPENAI_API_KEY` the same way if you use OpenAI.

### 4. Create the database, then run migrations

```bash
npx cdk deploy ChatData
cd ../backend && ./scripts/migrate.sh prod   # alembic upgrade head using IAM auth
```

If milestone M0 shows that CDK can't create an express cluster, this step will use a single documented AWS CLI command instead.

### 5. Deploy everything else

```bash
cd ../frontend && npm install && npm run build
cd ../iac && npx cdk deploy --all
```

The first deploy takes about 15–20 minutes, mostly for CloudFront and the certificate.

### 6. Check

```bash
curl -I https://chat.example.com
curl https://chat.example.com/healthz
```

Then sign up in the browser and send a message.

## CI/CD with GitHub Actions

1. Deploy `ChatCicd` once from your machine: `npx cdk deploy ChatCicd`.
2. In GitHub, go to **Settings → Secrets and variables → Actions → Variables** and add:
   - `AWS_ROLE_ARN`: the role ARN from the `ChatCicd` output
   - `AWS_REGION`: `us-east-1`
3. Push to `main`. The deploy workflow then:
   1. Runs the tests.
   2. Runs migrations.
   3. Builds the frontend.
   4. Runs `cdk deploy --all`.
   5. Smoke-tests the live URL.

No AWS keys are stored in GitHub.

## Day-to-day operations

| Task | How |
| :--- | :--- |
| **Roll back** | Revert the commit and push, or redeploy an earlier commit |
| **Raise the awake cap before a demo** | Change `awakeCapHours` and deploy `ChatApi` |
| **Resume after the daily cap** | Wait for the next UTC day, or run `aws lambda put-function-concurrency --function-name <api-fn> --reserved-concurrent-executions 10` |
| **Check costs** | AWS Billing console → Cost Explorer, filtered by the `app=chat-app` tag |
| **Restore a backup** | RDS console → the cluster → **Restore to point in time** (7 days kept). Then point `ChatData` at the restored cluster and redeploy. |
| **View logs** | CloudWatch → Log groups → `/aws/lambda/<api-fn>` |

## Tear down

```bash
npx cdk destroy --all
```

The Aurora cluster and S3 backups are kept on purpose. Delete them in the console when you're sure you don't need the data. Turn off deletion protection on the cluster first.
