import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface CicdStackProps extends cdk.StackProps {
  /** "owner/repo", for example "taitrd/ai-powered-chat". */
  githubRepo: string;
  /**
   * Immutable numeric IDs of the owner and repository. Repositories created after
   * 2026-07-15 (or renamed/transferred since) get an ID-based OIDC subject:
   *   repo:OWNER@OWNER_ID/REPO@REPO_ID:ref:refs/heads/BRANCH
   * Look them up with: curl -s https://api.github.com/repos/OWNER/REPO  (fields "owner.id" and "id")
   * Leave both unset only for older repositories that still use repo:OWNER/REPO:...
   */
  githubOwnerId?: string;
  githubRepoId?: string;
  /** Branch allowed to deploy. Defaults to "main". */
  deployBranch?: string;
}

/**
 * Builds the OIDC `sub` value GitHub puts in tokens for pushes to the deploy branch.
 * See https://github.blog/changelog/2026-04-23-immutable-subject-claims-for-github-actions-oidc-tokens/
 */
export function githubSubject(props: CicdStackProps): string {
  const [owner, repo] = props.githubRepo.split("/");
  const branch = props.deployBranch ?? "main";
  const repoPart =
    props.githubOwnerId && props.githubRepoId
      ? `${owner}@${props.githubOwnerId}/${repo}@${props.githubRepoId}`
      : `${owner}/${repo}`;
  return `repo:${repoPart}:ref:refs/heads/${branch}`;
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

    // Deploy role: only pushes to the deploy branch of this exact repository can assume it.
    this.deployRole = new iam.Role(this, "GitHubDeployRole", {
      roleName: "chat-app-github-deploy-role",
      assumedBy: new iam.FederatedPrincipal(
        oidcProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
            "token.actions.githubusercontent.com:sub": githubSubject(props),
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
