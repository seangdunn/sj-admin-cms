#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { AuthStack } from "../lib/auth-stack";
import { PortfolioApiStack } from "../lib/portfolio-api-stack";
import { HostingStack } from "../lib/hosting-stack";

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || "us-east-1",
};

// Deploy-time overrides only (see infra/.env.example) — not secrets, so sane
// defaults let `cdk deploy` work with zero env vars set. Every value below
// is deliberately parameterized rather than hardcoded: this repo is meant to
// be forked per client (see docs in the new-client-fork skill), and these
// are exactly the values a fork needs to change.
const tableName = process.env.TABLE_NAME || "portfolio-items";
const domainName = process.env.DOMAIN_NAME || "sjwebstudio.com";
const adminSubdomain = process.env.ADMIN_SUBDOMAIN || "admin.sjwebstudio.com";
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
  : [
      `https://${adminSubdomain}`,
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ];

const authStack = new AuthStack(app, "SjAdminCmsAuthStack", { env });

const apiStack = new PortfolioApiStack(app, "SjAdminCmsApiStack", {
  env,
  userPool: authStack.userPool,
  userPoolClient: authStack.userPoolClient,
  tableName,
  allowedOrigins,
});
apiStack.addStackDependency(authStack);

new HostingStack(app, "SjAdminCmsHostingStack", {
  env,
  domainName,
  adminSubdomain,
});
