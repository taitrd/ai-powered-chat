import * as path from "path";
import * as cdk from "aws-cdk-lib";
import * as ecr_assets from "aws-cdk-lib/aws-ecr-assets";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";

export interface ApiStackProps extends cdk.StackProps {
  userPoolId: string;
  userPoolClientId: string;
  clusterEndpoint: string;
  clusterIdentifier: string;
  clusterResourceIdentifier?: string;
  awakeCapHours?: number;
}

export class ApiStack extends cdk.Stack {
  public readonly apiFunction: lambda.DockerImageFunction;
  public readonly functionUrl: lambda.FunctionUrl;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const awakeCap = props.awakeCapHours ?? 3;

    // API Container Lambda using Lambda Web Adapter for streaming SSE
    this.apiFunction = new lambda.DockerImageFunction(this, "ApiFunction", {
      code: lambda.DockerImageCode.fromImageAsset(path.join(__dirname, "../../backend"), {
        platform: ecr_assets.Platform.LINUX_ARM64,
      }),
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: cdk.Duration.minutes(5),
      environment: {
        APP_ENV: "prod",
        AUTH_MODE: "cognito",
        COGNITO_USER_POOL_ID: props.userPoolId,
        COGNITO_CLIENT_ID: props.userPoolClientId,
        DATABASE_URL: `postgresql+asyncpg://app@${props.clusterEndpoint}:5432/chat`,
        DB_AUTH_MODE: "iam",
        AWS_LWA_INVOKE_MODE: "response_stream",
        AWS_LWA_READ_TIMEOUT_MS: "300000",
        LLM_DEFAULT: "gemini",
      },
      description: "FastAPI Chat backend with Lambda Web Adapter",
    });

    // Response streaming Function URL
    this.functionUrl = this.apiFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      invokeMode: lambda.InvokeMode.RESPONSE_STREAM,
    });

    // IAM Permissions: RDS IAM DB connect
    const rdsResourceArn = `arn:aws:rds-db:${this.region}:${this.account}:dbuser:*/app`;
    this.apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["rds-db:connect"],
        resources: [rdsResourceArn],
      })
    );

    // IAM Permissions: SSM parameter read for AI API keys
    this.apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter", "ssm:GetParameters"],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/chat-app/prod/*`,
        ],
      })
    );

    // IAM Permissions: Bedrock Claude streaming invocation
    this.apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModelWithResponseStream"],
        resources: ["*"],
      })
    );

    // Awake Guard Lambda to cap Aurora compute costs
    const awakeGuardFn = new lambda.Function(this, "AwakeGuardFunction", {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "awake-guard.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../lambda")),
      timeout: cdk.Duration.minutes(1),
      memorySize: 128,
      environment: {
        API_FUNCTION_NAME: this.apiFunction.functionName,
        CLUSTER_IDENTIFIER: props.clusterIdentifier,
        AWAKE_CAP_HOURS: awakeCap.toString(),
      },
      description: "Daily awake cap guard to enforce Aurora idle pauses",
    });

    // Awake guard permissions: CloudWatch metric data + Lambda concurrency management
    awakeGuardFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["cloudwatch:GetMetricData"],
        resources: ["*"],
      })
    );
    awakeGuardFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "lambda:PutFunctionConcurrency",
          "lambda:DeleteFunctionConcurrency",
        ],
        resources: [this.apiFunction.functionArn],
      })
    );

    // Schedule awake guard every 15 minutes
    new events.Rule(this, "AwakeGuardSchedule", {
      schedule: events.Schedule.rate(cdk.Duration.minutes(15)),
      targets: [new targets.LambdaFunction(awakeGuardFn)],
      description: "Trigger awake guard every 15 minutes",
    });

    new cdk.CfnOutput(this, "FunctionUrlOutput", {
      value: this.functionUrl.url,
      description: "Lambda Function URL (response stream)",
      exportName: "ChatFunctionUrl",
    });

    new cdk.CfnOutput(this, "ApiFunctionName", {
      value: this.apiFunction.functionName,
      description: "API Lambda Function Name",
      exportName: "ChatApiFunctionName",
    });
  }
}
