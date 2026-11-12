import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface CicdStackProps extends cdk.StackProps {
  githubRepo: string;
}

export class CicdStack extends cdk.Stack {
  public readonly deployRole: iam.Role;

  constructor(scope: Construct, id: string, props: CicdStackProps) {
    super(scope, id, props);

    // GitHub OIDC OpenID Connect Provider
    const oidcProvider = new iam.OpenIdConnectProvider(
      this,
      "GitHubOidcProvider",
      {
        url: "https://token.actions.githubusercontent.com",
        clientIds: ["sts.amazonaws.com"],
      },
    );

    // Deploy Role assumed by GitHub Actions for the repository
    this.deployRole = new iam.Role(this, "GitHubDeployRole", {
      roleName: "chat-app-github-deploy-role",
      assumedBy: new iam.FederatedPrincipal(
        oidcProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          },
          StringLike: {
            "token.actions.githubusercontent.com:sub": [
              `repo:${props.githubRepo}:*`,
              `repo:${props.githubRepo.toLowerCase()}:*`,
            ],
          },
        },
        "sts:AssumeRoleWithWebIdentity",
      ),
      description: "GitHub Actions CI/CD deployment role for chat-app",
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess"),
      ],
      maxSessionDuration: cdk.Duration.hours(1),
    });

    new cdk.CfnOutput(this, "DeployRoleArn", {
      value: this.deployRole.roleArn,
      description: "Add to GitHub Actions Variables as AWS_ROLE_ARN",
      exportName: "ChatDeployRoleArn",
    });
  }
}
