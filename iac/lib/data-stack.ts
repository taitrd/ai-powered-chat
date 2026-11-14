import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as rds from "aws-cdk-lib/aws-rds";
import { Construct } from "constructs";

export interface DataStackProps extends cdk.StackProps {
  /**
   * IAM user allowed to run one-off SQL through the Data API (setup scripts, live checks):
   * Data API calls on this cluster, plus reading the admin and app_data secrets.
   * Leave unset to remove the access.
   */
  dataApiOperatorUser?: string;
}

export class DataStack extends cdk.Stack {
  public readonly cluster: rds.DatabaseCluster;
  public readonly vpc: ec2.Vpc;
  public readonly securityGroup: ec2.SecurityGroup;
  /** Password login for the Data API user `app_data` (the Data API can't use IAM tokens). */

  constructor(scope: Construct, id: string, props?: DataStackProps) {
    super(scope, id, props);

    // Minimal VPC with 0 NAT gateways to avoid idle costs (~$32/mo saved).
    // The subnets are "public" for historical reasons, but the database has no public IP
    // and no inbound rules: the app reaches it only through the RDS Data API (HTTPS).
    // Changing the subnets would replace the cluster, so they stay as they are.
    this.vpc = new ec2.Vpc(this, "ChatVpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "Public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    this.securityGroup = new ec2.SecurityGroup(this, "DbSecurityGroup", {
      vpc: this.vpc,
      // Keep this description: changing it would replace the security group.
      // There are no inbound rules; the app uses the RDS Data API instead.
      description: "Allow inbound PostgreSQL access to Aurora",
      allowAllOutbound: true,
    });

    this.cluster = new rds.DatabaseCluster(this, "AuroraCluster", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_8,
      }),
      serverlessV2MinCapacity: 0,
      serverlessV2MaxCapacity: 1,
      writer: rds.ClusterInstance.serverlessV2("writer", {
        // No public IPv4 (saves ~$3.65/month) and no internet exposure.
        publiclyAccessible: false,
      }),
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [this.securityGroup],
      defaultDatabaseName: "chat",
      iamAuthentication: true,
      // RDS Data API: SQL over HTTPS, so the app needs no network path to the database.
      enableDataApi: true,
      backup: {
        retention: cdk.Duration.days(7),
      },
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    if (props?.dataApiOperatorUser) {
      // A managed policy, not an inline one: IAM caps a user's inline policies at 2,048 bytes.
      new iam.ManagedPolicy(this, "DataApiOperatorPolicy", {
        description: "One-off SQL through the RDS Data API (setup scripts, live checks)",
        users: [iam.User.fromUserName(this, "DataApiOperator", props.dataApiOperatorUser)],
        statements: [
          new iam.PolicyStatement({
            actions: [
              "rds-data:ExecuteStatement",
              "rds-data:BatchExecuteStatement",
              "rds-data:BeginTransaction",
              "rds-data:CommitTransaction",
              "rds-data:RollbackTransaction",
            ],
            resources: [this.cluster.clusterArn],
          }),
          new iam.PolicyStatement({
            actions: ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
            resources: [this.cluster.secret!.secretArn],
          }),
        ],
      });
    }

    new cdk.CfnOutput(this, "ClusterArn", {
      value: this.cluster.clusterArn,
      description: "Aurora cluster ARN (DATA_API_RESOURCE_ARN)",
    });

    new cdk.CfnOutput(this, "AdminSecretArn", {
      value: this.cluster.secret!.secretArn,
      description: "Admin (postgres) secret, for one-off setup through the Data API",
    });

    new cdk.CfnOutput(this, "ClusterEndpoint", {
      value: this.cluster.clusterEndpoint.hostname,
      description: "Aurora Cluster Endpoint Hostname",
      exportName: "ChatClusterEndpoint",
    });

    new cdk.CfnOutput(this, "ClusterPort", {
      value: this.cluster.clusterEndpoint.port.toString(),
      description: "Aurora Cluster Port",
      exportName: "ChatClusterPort",
    });

    new cdk.CfnOutput(this, "ClusterIdentifier", {
      value: this.cluster.clusterIdentifier,
      description: "Aurora Cluster Identifier",
      exportName: "ChatClusterIdentifier",
    });
  }
}
