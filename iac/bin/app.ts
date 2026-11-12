#!/usr/bin/env node
import * as path from "path";
import * as dotenv from "dotenv";

// Load root .env file automatically
dotenv.config({ path: path.join(__dirname, "../../.env.iac") });

import * as cdk from "aws-cdk-lib";
import { AuthStack } from "../lib/auth-stack";
import { DataStack } from "../lib/data-stack";
import { ApiStack } from "../lib/api-stack";
import { WebStack } from "../lib/web-stack";
import { CicdStack } from "../lib/cicd-stack";

const app = new cdk.App();

const account =
  (app.node.tryGetContext("accountId") as string) ||
  (app.node.tryGetContext("account") as string) ||
  process.env.CDK_DEFAULT_ACCOUNT ||
  process.env.AWS_ACCOUNT_ID;

const region =
  (app.node.tryGetContext("region") as string) ||
  process.env.CDK_DEFAULT_REGION ||
  process.env.AWS_REGION ||
  "us-east-1";

const env: cdk.Environment = {
  account: account || undefined,
  region,
};

// Context values from cdk.json or -c command line flags
const domainName =
  (app.node.tryGetContext("domainName") as string) || undefined;
const hostedZoneName =
  (app.node.tryGetContext("hostedZoneName") as string) || undefined;
const certificateArn =
  (app.node.tryGetContext("certificateArn") as string) || undefined;
const githubRepo =
  (app.node.tryGetContext("githubRepo") as string) || "owner/repo";
const githubOwnerId =
  (app.node.tryGetContext("githubOwnerId") as string) || undefined;
const githubRepoId =
  (app.node.tryGetContext("githubRepoId") as string) || undefined;
const awakeCapHours = Number(app.node.tryGetContext("awakeCapHours") || 3);

// 1. Authentication stack (Cognito)
const authStack = new AuthStack(app, "ChatAuth", { env });

// 2. Data stack (Aurora Serverless PostgreSQL)
const dataStack = new DataStack(app, "ChatData", { env });

// 3. API stack (FastAPI on Lambda with Lambda Web Adapter & Awake Guard)
const apiStack = new ApiStack(app, "ChatApi", {
  env,
  userPoolId: authStack.userPool.userPoolId,
  userPoolClientId: authStack.userPoolClient.userPoolClientId,
  clusterEndpoint: dataStack.cluster.clusterEndpoint.hostname,
  clusterIdentifier: dataStack.cluster.clusterIdentifier,
  awakeCapHours,
});
apiStack.addStackDependency(authStack);
apiStack.addStackDependency(dataStack);

// 4. Web stack (API Gateway HTTP API with Custom Domain & Route 53)
const webStack = new WebStack(app, "ChatWeb", {
  env,
  functionUrl: apiStack.functionUrl,
  domainName,
  hostedZoneName,
  certificateArn,
});
webStack.addStackDependency(apiStack);

// 5. CI/CD stack (GitHub OIDC & deploy role)
new CicdStack(app, "ChatCicd", {
  env,
  githubRepo,
  githubOwnerId,
  githubRepoId,
});

app.synth();
