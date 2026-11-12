import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
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

const STAGE_NAME = "prod";

/**
 * Matches the Lambda timeout. Streaming integrations allow up to 15 minutes
 * without a quota increase (non-streaming REST integrations stop at 29 seconds).
 */
const INTEGRATION_TIMEOUT = cdk.Duration.minutes(5);

/**
 * Logical ID of the custom-domain mapping created by the previous HTTP API version
 * of this stack. Reusing it makes CloudFormation update the mapping in place (ApiId
 * and Stage are no-interruption updates) instead of creating a second mapping for
 * the same domain, which would conflict.
 */
const LEGACY_API_MAPPING_ID = "HttpApiDefaultStageChatWebCustomDomainundefined34190037";

/**
 * Public entry point: an API Gateway REST API with response streaming, forwarding
 * every path (frontend files and /api/v1) to the FastAPI Lambda Function URL.
 *
 * REST API rather than HTTP API, because only REST APIs can stream responses.
 * HTTP APIs buffer the whole reply and stop after about 30 seconds, which broke
 * token-by-token chat replies and slow first requests while Aurora resumes.
 */
export class WebStack extends cdk.Stack {
  public readonly restApi: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);

    // Function URL host without the trailing slash, e.g. https://abc.lambda-url.us-east-1.on.aws
    const functionOrigin = `https://${cdk.Fn.select(
      2,
      cdk.Fn.split("/", props.functionUrl.url)
    )}`;

    this.restApi = new apigateway.RestApi(this, "RestApi", {
      restApiName: "ChatAppRestApi",
      description:
        "Streams the FastAPI backend and frontend SPA from the Lambda Function URL",
      endpointConfiguration: { types: [apigateway.EndpointType.REGIONAL] },
      // Don't create the account-wide API Gateway CloudWatch role/setting from this stack.
      cloudWatchRole: false,
      deployOptions: {
        stageName: STAGE_NAME,
        // Cost guard for a public demo; raise for real traffic.
        throttlingRateLimit: 20,
        throttlingBurstLimit: 40,
      },
    });

    const streamingProxy = (path: string, extra: apigateway.IntegrationOptions = {}) =>
      new apigateway.HttpIntegration(`${functionOrigin}${path}`, {
        proxy: true,
        httpMethod: "ANY",
        options: {
          ...extra,
          responseTransferMode: apigateway.ResponseTransferMode.STREAM,
          timeout: INTEGRATION_TIMEOUT,
        },
      });

    // "/" (the SPA's index.html)
    this.restApi.root.addMethod("ANY", streamingProxy("/"));

    // Everything else, including /api/v1/... and /assets/...
    this.restApi.root
      .addResource("{proxy+}")
      .addMethod(
        "ANY",
        streamingProxy("/{proxy}", {
          requestParameters: {
            "integration.request.path.proxy": "method.request.path.proxy",
          },
        }),
        { requestParameters: { "method.request.path.proxy": true } }
      );

    // Custom domain & Route 53. The domain, certificate and DNS record are unchanged
    // from the HTTP API version; only the API they map to changes.
    if (
      props.domainName &&
      props.hostedZoneName &&
      this.account &&
      !cdk.Token.isUnresolved(this.account)
    ) {
      const hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
        domainName: props.hostedZoneName,
      });

      const certificate = props.certificateArn
        ? acm.Certificate.fromCertificateArn(this, "SiteCertificate", props.certificateArn)
        : new acm.Certificate(this, "SiteCertificate", {
            domainName: props.domainName,
            validation: acm.CertificateValidation.fromDns(hostedZone),
          });

      // Regional custom domain (shared by REST and HTTP APIs in API Gateway).
      const customDomain = new apigwv2.DomainName(this, "CustomDomain", {
        domainName: props.domainName,
        certificate,
      });

      const mapping = new apigwv2.CfnApiMapping(this, "ApiMapping", {
        domainName: customDomain.name,
        apiId: this.restApi.restApiId,
        stage: this.restApi.deploymentStage.stageName,
      });
      mapping.overrideLogicalId(LEGACY_API_MAPPING_ID);
      mapping.node.addDependency(this.restApi.deploymentStage);

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

    new cdk.CfnOutput(this, "RestApiEndpoint", {
      value: this.restApi.url,
      description: "Default API Gateway REST API endpoint (includes the /prod stage)",
    });
  }
}
