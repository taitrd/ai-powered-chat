import * as cdk from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import * as apigw_integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs";

export interface WebStackProps extends cdk.StackProps {
  functionUrl: lambda.FunctionUrl;
  domainName?: string;
  hostedZoneName?: string;
  certificateArn?: string;
}

export class WebStack extends cdk.Stack {
  public readonly httpApi: apigw.HttpApi;

  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);

    // Strip trailing slash from functionUrl.url in CloudFormation
    const cleanUrl = `https://${cdk.Fn.select(
      2,
      cdk.Fn.split("/", props.functionUrl.url)
    )}`;

    // HTTP_PROXY integration forwarding all requests to the streaming Lambda Function URL
    const urlIntegration = new apigw_integrations.HttpUrlIntegration(
      "ApiUrlIntegration",
      cleanUrl
    );

    let domainMapping: apigw.DomainMappingOptions | undefined;

    // Custom Domain & Route 53 setup
    if (
      props.domainName &&
      props.hostedZoneName &&
      this.account &&
      !cdk.Token.isUnresolved(this.account)
    ) {
      const hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
        domainName: props.hostedZoneName,
      });

      // Use existing certificate if provided, or request via Route 53 DNS validation
      const certificate = props.certificateArn
        ? acm.Certificate.fromCertificateArn(
            this,
            "SiteCertificate",
            props.certificateArn
          )
        : new acm.Certificate(this, "SiteCertificate", {
            domainName: props.domainName,
            validation: acm.CertificateValidation.fromDns(hostedZone),
          });

      // API Gateway Custom Domain Name (regional in us-east-1)
      const customDomain = new apigw.DomainName(this, "CustomDomain", {
        domainName: props.domainName,
        certificate,
      });

      domainMapping = {
        domainName: customDomain,
      };

      // Route 53 A-record Alias: aichat.taitrd.com -> API Gateway HTTP API
      new route53.ARecord(this, "SiteAliasRecord", {
        zone: hostedZone,
        recordName: props.domainName,
        target: route53.RecordTarget.fromAlias(
          new targets.ApiGatewayv2DomainProperties(
            customDomain.regionalDomainName,
            customDomain.regionalHostedZoneId
          )
        ),
      });

      new cdk.CfnOutput(this, "CustomDomainUrl", {
        value: `https://${props.domainName}`,
        description: "Application URL on Custom Domain (HTTPS)",
      });
    }

    // HTTP API routing all traffic (frontend SPA + backend /api/v1) to the FastAPI Lambda Function URL
    this.httpApi = new apigw.HttpApi(this, "HttpApi", {
      apiName: "ChatAppHttpApi",
      defaultIntegration: urlIntegration,
      defaultDomainMapping: domainMapping,
      description: "API Gateway HTTP API serving FastAPI backend and frontend SPA",
    });

    new cdk.CfnOutput(this, "HttpApiEndpoint", {
      value: this.httpApi.apiEndpoint,
      description: "Default API Gateway HTTP API Endpoint",
    });
  }
}
