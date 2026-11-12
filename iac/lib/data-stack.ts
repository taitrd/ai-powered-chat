import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import { Construct } from "constructs";

export class DataStack extends cdk.Stack {
  public readonly cluster: rds.DatabaseCluster;
  public readonly vpc: ec2.Vpc;
  public readonly securityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Minimal VPC with 0 NAT gateways to avoid idle costs (~$32/mo saved).
    // Public subnets allow Aurora's internet access gateway without NAT Gateways.
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
      description: "Allow inbound PostgreSQL access to Aurora",
      allowAllOutbound: true,
    });

    this.securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(5432),
      "Allow PostgreSQL port 5432 (protected by IAM authentication)",
    );

    this.cluster = new rds.DatabaseCluster(this, "AuroraCluster", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_8,
      }),
      serverlessV2MinCapacity: 0,
      serverlessV2MaxCapacity: 1,
      writer: rds.ClusterInstance.serverlessV2("writer", {
        publiclyAccessible: true,
      }),
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [this.securityGroup],
      defaultDatabaseName: "chat",
      iamAuthentication: true,
      backup: {
        retention: cdk.Duration.days(7),
      },
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
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
