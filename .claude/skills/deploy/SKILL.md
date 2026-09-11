---
name: deploy
description: Deploy sj-admin-cms (frontend + CDK infra) in the correct order, and keep .env.local in sync with stack outputs. Use whenever the user asks to deploy, redeploy, or push changes live for this project.
---

# Deploy sj-admin-cms

This is a static-export Next.js app on S3+CloudFront in front of a
Cognito + API Gateway + Lambda + DynamoDB backend, deployed via CDK
(`infra/`). **Ordering matters** — get it wrong and the hosting stack
ships a stale or broken build.

## Order of operations

1. **If `SjAdminCmsAuthStack` or `SjAdminCmsApiStack` changed** (or this is
   a first deploy): deploy those first.
   ```
   cd infra
   npx cdk deploy SjAdminCmsAuthStack SjAdminCmsApiStack --profile sj-web-studio
   ```
   Capture the `UserPoolId`, `UserPoolClientId`, `ApiUrl`, and
   `ImagesCdnDomain` outputs.

2. **Sync `.env.local`** (repo root) with those values if any changed —
   `NEXT_PUBLIC_USER_POOL_ID`, `NEXT_PUBLIC_USER_POOL_CLIENT_ID`,
   `NEXT_PUBLIC_API_URL`. This is a **static export**: these values get
   baked into the JS bundle at build time, not read at runtime — a stale
   `.env.local` means a stale deployed app even after a successful CDK
   deploy.

3. **Build the frontend** — must happen *after* `.env.local` is current:
   ```
   npm run build
   ```
   Confirm it produced `out/` with no errors. Run `npm run lint` too if
   any frontend files changed.

4. **Deploy the hosting stack** — this is what actually ships `out/`:
   ```
   cd infra
   npx cdk deploy SjAdminCmsHostingStack --profile sj-web-studio
   ```
   `BucketDeployment` syncs `out/` to S3 and invalidates CloudFront
   automatically — no separate step needed.

## First deploy only: DNS

`SjAdminCmsHostingStack`'s ACM certificate needs DNS validation, and the
admin subdomain needs a CNAME once the distribution exists — both are
manual steps at the registrar. See `infra/README.md`'s "First deploy of
the hosting stack" section for the exact commands to find the validation
record and what to add. **Don't run this unattended** — surface the
CNAME details to the user and wait for confirmation before assuming DNS
propagated.

## If Auth or Api stacks are torn down and redeployed

Cognito and API Gateway issue new IDs/URLs on a fresh create. Re-sync
`.env.local` (step 2) and redo steps 3-4, even if no frontend code
changed — the old build has the old IDs baked in.

## Confirm before deploying

Creating or modifying real AWS infrastructure isn't a silent action —
confirm with the user before running any `cdk deploy`, same as any other
action that touches shared/billed resources outside the local repo.
