import * as path from "path";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";

export interface HostingStackProps extends cdk.StackProps {
  /** Bare apex domain, e.g. "sjwebstudio.com". Parameterized for forking. */
  domainName: string;
  /** Real CNAME target for CloudFront, e.g. "admin.sjwebstudio.com". */
  adminSubdomain: string;
}

export class HostingStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: HostingStackProps) {
    super(scope, id, props);

    // ------------------------------------------------------------------
    // S3 — private origin bucket. DESTROY (not RETAIN): this bucket only
    // mirrors the Next.js static export output, which is rebuilt from
    // source on every deploy — same reasoning as sj-web-studio-clean's
    // hosting-stack.ts (contrast with the DynamoDB table / images bucket
    // in portfolio-api-stack.ts, which hold real content and use RETAIN).
    // ------------------------------------------------------------------
    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      lifecycleRules: [
        {
          noncurrentVersionExpiration: cdk.Duration.days(90),
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ------------------------------------------------------------------
    // ACM certificate — DNS validation, no hosted zone (domain's DNS
    // stays with the external registrar, matching sj-web-studio-clean's
    // apex-domain strategy): cdk deploy will pause and print the
    // validation CNAME(s) to add manually.
    // ------------------------------------------------------------------
    const certificate = new acm.Certificate(this, "AdminCertificate", {
      domainName: props.adminSubdomain,
      validation: acm.CertificateValidation.fromDns(),
    });

    // ------------------------------------------------------------------
    // Security headers — an admin panel should never be indexed, full
    // stop, so unlike the marketing site's TEMPORARY pre-launch
    // X-Robots-Tag, this one is permanent.
    // ------------------------------------------------------------------
    const noIndexHeaderPolicy = new cloudfront.ResponseHeadersPolicy(this, "NoIndexHeaderPolicy", {
      customHeadersBehavior: {
        customHeaders: [{ header: "X-Robots-Tag", value: "noindex, nofollow", override: true }],
      },
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.days(365),
          includeSubdomains: true,
          override: true,
        },
        xssProtection: { protection: true, modeBlock: true, override: true },
      },
    });

    // ------------------------------------------------------------------
    // Pretty URLs — Next.js static export emits a flat <route>.html per
    // page (app/login/page.tsx -> login.html), which won't resolve for a
    // direct load/refresh behind CloudFront+OAC without this rewrite.
    // See infra/cloudfront-functions/pretty-urls.js (copied verbatim from
    // sj-web-studio-clean — generic logic, nothing site-specific).
    // ------------------------------------------------------------------
    const prettyUrlsFunction = new cloudfront.Function(this, "PrettyUrlsFunction", {
      code: cloudfront.FunctionCode.fromFile({
        filePath: path.join(__dirname, "../cloudfront-functions/pretty-urls.js"),
      }),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    // ------------------------------------------------------------------
    // CloudFront distribution
    // ------------------------------------------------------------------
    const distribution = new cloudfront.Distribution(this, "AdminDistribution", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: noIndexHeaderPolicy,
        functionAssociations: [
          {
            function: prettyUrlsFunction,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      defaultRootObject: "index.html",
      domainNames: [props.adminSubdomain],
      certificate,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      // 403 (private-bucket-behind-OAC's response for a missing key, same
      // as 404 would be for an anonymous caller — either can surface) and
      // 404 both map to a real 404 page rather than serving under a 403
      // status, which would otherwise tell search engines/tools the page
      // exists but is forbidden rather than simply not existing.
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 404,
          responsePagePath: "/404.html",
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 404,
          responsePagePath: "/404.html",
          ttl: cdk.Duration.minutes(5),
        },
      ],
    });

    // ------------------------------------------------------------------
    // Deploy the Next.js static export to the bucket and invalidate
    // CloudFront on every `cdk deploy` — no separate sync/invalidate
    // script. cacheControl noCache (not no-store): the browser still
    // caches, but must revalidate with the server on every load — same
    // reasoning as sj-web-studio-clean's hosting-stack.ts (no hashed
    // filenames for the HTML entry points, so a stale browser cache with
    // no revalidation would silently keep serving pre-deploy content).
    // ------------------------------------------------------------------
    new s3deploy.BucketDeployment(this, "DeploySite", {
      sources: [s3deploy.Source.asset(path.join(__dirname, "../../out"))],
      destinationBucket: siteBucket,
      cacheControl: [s3deploy.CacheControl.noCache()],
      distribution,
      distributionPaths: ["/*"],
    });

    new cdk.CfnOutput(this, "SiteBucketName", { value: siteBucket.bucketName });
    new cdk.CfnOutput(this, "DistributionDomainName", {
      value: distribution.distributionDomainName,
      description: `Point a CNAME for ${props.adminSubdomain} at this value`,
    });
    new cdk.CfnOutput(this, "DistributionId", {
      value: distribution.distributionId,
      description: "For manual `aws cloudfront create-invalidation` if ever needed outside cdk deploy",
    });
  }
}
