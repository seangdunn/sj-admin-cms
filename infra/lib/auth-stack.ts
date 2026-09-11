import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cognito from "aws-cdk-lib/aws-cognito";

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    // ------------------------------------------------------------------
    // User Pool
    // No public self-signup — admins are provisioned via
    // `aws cognito-idp admin-create-user` (see infra/README.md), never
    // through the app itself. RemovalPolicy.RETAIN: real identity data,
    // not reproducible from git, same reasoning as the DynamoDB table in
    // portfolio-api-stack.ts (contrast with the hosting bucket's DESTROY,
    // which only mirrors git-tracked source).
    // ------------------------------------------------------------------
    this.userPool = new cognito.UserPool(this, "AdminUserPool", {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      // TOTP only — SMS MFA carries a per-message cost and isn't needed
      // for a small, known admin user base. Optional (not required): an
      // admin opts in via the app's /settings page, which handles both
      // enrollment and the sign-in challenge (see lib/cognito.ts).
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { otp: true, sms: false },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ------------------------------------------------------------------
    // User Pool Client — public SPA client (no secret: a static-exported
    // Next.js app can't keep one). USER_PASSWORD_AUTH must be explicit
    // here since it's off by default; see CLAUDE.md's Frontend Auth
    // section for why this flow was chosen over SRP/Amplify.
    // ------------------------------------------------------------------
    this.userPoolClient = new cognito.UserPoolClient(this, "AdminUserPoolClient", {
      userPool: this.userPool,
      generateSecret: false,
      authFlows: {
        userPassword: true,
      },
      preventUserExistenceErrors: true,
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(7),
    });

    new cdk.CfnOutput(this, "UserPoolId", { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: this.userPoolClient.userPoolClientId,
    });
  }
}
