import * as path from "path";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { HttpUserPoolAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as cognito from "aws-cdk-lib/aws-cognito";

export interface PortfolioApiStackProps extends cdk.StackProps {
  userPool: cognito.IUserPool;
  userPoolClient: cognito.IUserPoolClient;
  /** Parameterized for forking — see infra/.env.example. */
  tableName: string;
  /** Origins allowed to call the API via CORS (and the images bucket's CORS). */
  allowedOrigins: string[];
}

export class PortfolioApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PortfolioApiStackProps) {
    super(scope, id, props);

    // ------------------------------------------------------------------
    // DynamoDB — portfolio items
    // Simple `id` primary key, not a pk/sk single-table design: item
    // counts are small (dozens, not thousands), so a full Scan sorted by
    // `order` in the Lambda is simpler and cheaper than maintaining a GSI
    // purely to support ordering. RemovalPolicy.RETAIN: real content, not
    // reproducible from git.
    // ------------------------------------------------------------------
    const table = new dynamodb.Table(this, "PortfolioItems", {
      tableName: props.tableName,
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ------------------------------------------------------------------
    // S3 — portfolio images (private; served via CloudFront/OAC below,
    // never direct public S3 access). RemovalPolicy.RETAIN, same
    // reasoning as the table. No explicit bucketName: S3 names are
    // globally unique, so letting CDK generate one means a client fork
    // never collides with this account's bucket.
    // ------------------------------------------------------------------
    const imagesBucket = new s3.Bucket(this, "PortfolioImages", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      // Needed for the browser's direct presigned-POST upload to succeed —
      // this is the S3 bucket's own CORS config, separate from the HTTP
      // API's CORS below.
      cors: [
        {
          allowedMethods: [s3.HttpMethods.POST],
          allowedOrigins: props.allowedOrigins,
          allowedHeaders: ["*"],
          maxAge: 3000,
        },
      ],
    });

    // ------------------------------------------------------------------
    // CloudFront — fronts the images bucket. Default *.cloudfront.net
    // domain (no ACM/custom domain for v1: raw image URLs don't need
    // branding, and it avoids a second DNS validation checkpoint).
    // ------------------------------------------------------------------
    const imagesDistribution = new cloudfront.Distribution(this, "PortfolioImagesCdn", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(imagesBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });
    const imagesCdnDomain = imagesDistribution.distributionDomainName;

    // ------------------------------------------------------------------
    // Lambdas — small, single-purpose, named for what they do. IAM is
    // scoped per-resource via addToRolePolicy (never grantReadWriteData()
    // /grantPut(), which grant broader access than each function needs).
    // ------------------------------------------------------------------
    const bundling = { minify: true };

    const listPortfolioItems = new lambdaNodejs.NodejsFunction(this, "ListPortfolioItems", {
      functionName: "list-portfolio-items",
      entry: path.join(__dirname, "../lambda/list-portfolio-items.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(10),
      environment: { TABLE_NAME: table.tableName },
      bundling,
    });
    listPortfolioItems.addToRolePolicy(
      new iam.PolicyStatement({ actions: ["dynamodb:Scan"], resources: [table.tableArn] })
    );

    const createPortfolioItem = new lambdaNodejs.NodejsFunction(this, "CreatePortfolioItem", {
      functionName: "create-portfolio-item",
      entry: path.join(__dirname, "../lambda/create-portfolio-item.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(10),
      environment: { TABLE_NAME: table.tableName, IMAGES_CDN_DOMAIN: imagesCdnDomain },
      bundling,
    });
    createPortfolioItem.addToRolePolicy(
      new iam.PolicyStatement({ actions: ["dynamodb:PutItem"], resources: [table.tableArn] })
    );

    const updatePortfolioItem = new lambdaNodejs.NodejsFunction(this, "UpdatePortfolioItem", {
      functionName: "update-portfolio-item",
      entry: path.join(__dirname, "../lambda/update-portfolio-item.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(10),
      environment: { TABLE_NAME: table.tableName, IMAGES_CDN_DOMAIN: imagesCdnDomain },
      bundling,
    });
    updatePortfolioItem.addToRolePolicy(
      new iam.PolicyStatement({ actions: ["dynamodb:PutItem"], resources: [table.tableArn] })
    );

    const deletePortfolioItem = new lambdaNodejs.NodejsFunction(this, "DeletePortfolioItem", {
      functionName: "delete-portfolio-item",
      entry: path.join(__dirname, "../lambda/delete-portfolio-item.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(10),
      environment: { TABLE_NAME: table.tableName },
      bundling,
    });
    deletePortfolioItem.addToRolePolicy(
      new iam.PolicyStatement({ actions: ["dynamodb:DeleteItem"], resources: [table.tableArn] })
    );

    const generateUploadUrl = new lambdaNodejs.NodejsFunction(this, "GenerateUploadUrl", {
      functionName: "generate-upload-url",
      entry: path.join(__dirname, "../lambda/generate-upload-url.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(10),
      environment: {
        BUCKET_NAME: imagesBucket.bucketName,
        IMAGES_CDN_DOMAIN: imagesCdnDomain,
      },
      bundling,
    });
    generateUploadUrl.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObject"],
        resources: [imagesBucket.arnForObjects("*")],
      })
    );

    // ------------------------------------------------------------------
    // HTTP API
    // ------------------------------------------------------------------
    const httpApi = new apigwv2.HttpApi(this, "PortfolioApi", {
      corsPreflight: {
        allowOrigins: props.allowedOrigins,
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.DELETE,
        ],
        allowHeaders: ["Content-Type", "Authorization"],
        allowCredentials: false,
        maxAge: cdk.Duration.hours(1),
      },
    });

    // Validates the ID token (has the aud claim API Gateway's JWT
    // authorizer checks by default) — the frontend sends idToken as the
    // bearer, not the access token. Default identity source
    // ($request.header.Authorization) matches that.
    const authorizer = new HttpUserPoolAuthorizer("AdminAuthorizer", props.userPool, {
      userPoolClients: [props.userPoolClient],
    });

    const publicRoutes = httpApi.addRoutes({
      path: "/api/v1/portfolio",
      methods: [apigwv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration("ListPortfolioItemsIntegration", listPortfolioItems),
    });

    const createRoutes = httpApi.addRoutes({
      path: "/api/v1/admin/portfolio",
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration("CreatePortfolioItemIntegration", createPortfolioItem),
      authorizer,
    });

    const updateRoutes = httpApi.addRoutes({
      path: "/api/v1/admin/portfolio/{id}",
      methods: [apigwv2.HttpMethod.PUT],
      integration: new HttpLambdaIntegration("UpdatePortfolioItemIntegration", updatePortfolioItem),
      authorizer,
    });

    const deleteRoutes = httpApi.addRoutes({
      path: "/api/v1/admin/portfolio/{id}",
      methods: [apigwv2.HttpMethod.DELETE],
      integration: new HttpLambdaIntegration("DeletePortfolioItemIntegration", deletePortfolioItem),
      authorizer,
    });

    const uploadUrlRoutes = httpApi.addRoutes({
      path: "/api/v1/admin/portfolio/upload-url",
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration("GenerateUploadUrlIntegration", generateUploadUrl),
      authorizer,
    });

    // ------------------------------------------------------------------
    // Route-level throttling — the real anti-abuse/cost control for a
    // PAY_PER_REQUEST table and an unauthenticated route (same pattern as
    // sj-web-studio-clean's contact-form-stack.ts). CfnStage.routeSettings
    // is typed `any` in CDK's codegen — passed through to CloudFormation
    // verbatim, so it needs raw PascalCase keys rather than the camelCase
    // CDK normally auto-converts. The public GET route gets the tightest
    // limits since it's the only route with no Cognito gate.
    // ------------------------------------------------------------------
    const stage = httpApi.defaultStage?.node.defaultChild as apigwv2.CfnStage;
    stage.routeSettings = {
      "GET /api/v1/portfolio": { ThrottlingBurstLimit: 10, ThrottlingRateLimit: 5 },
      "POST /api/v1/admin/portfolio": { ThrottlingBurstLimit: 20, ThrottlingRateLimit: 10 },
      "PUT /api/v1/admin/portfolio/{id}": { ThrottlingBurstLimit: 20, ThrottlingRateLimit: 10 },
      "DELETE /api/v1/admin/portfolio/{id}": { ThrottlingBurstLimit: 20, ThrottlingRateLimit: 10 },
      "POST /api/v1/admin/portfolio/upload-url": { ThrottlingBurstLimit: 20, ThrottlingRateLimit: 10 },
    };
    // The stage's RouteSettings reference routes by key, so each route
    // must exist first — CDK doesn't infer that dependency automatically
    // from a plain property assignment.
    [...publicRoutes, ...createRoutes, ...updateRoutes, ...deleteRoutes, ...uploadUrlRoutes].forEach(
      (route) => stage.addResourceDependency(route.node.defaultChild as apigwv2.CfnRoute)
    );

    new cdk.CfnOutput(this, "ApiUrl", { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, "ImagesCdnDomain", { value: imagesCdnDomain });
  }
}
