# infra — Auth, Portfolio API, Image Uploads, Hosting

AWS CDK (TypeScript) app with three stacks. See the repo root's `CLAUDE.md`
and `docs/project-brief.md` for full architecture rationale — this file
covers only what's needed to deploy and use what's here.

- **`SjAdminCmsAuthStack`** — Cognito User Pool + App Client.
- **`SjAdminCmsApiStack`** — DynamoDB table, images S3 bucket + CloudFront,
  5 Lambdas, HTTP API with a Cognito authorizer on `/api/v1/admin/*`.
- **`SjAdminCmsHostingStack`** — S3 + CloudFront + ACM for the admin
  frontend itself.

## API: `/api/v1/portfolio`

| Route | Method | Auth | Notes |
|---|---|---|---|
| `/api/v1/portfolio` | GET | none | Full item list, sorted by `order` |
| `/api/v1/admin/portfolio` | POST | Cognito | Create |
| `/api/v1/admin/portfolio/{id}` | PUT | Cognito | Full-replace update |
| `/api/v1/admin/portfolio/{id}` | DELETE | Cognito | |
| `/api/v1/admin/portfolio/upload-url` | POST | Cognito | Returns a presigned S3 POST for image upload |

Auth: `Authorization: Bearer <idToken>` — the **ID token**, not the access
token (API Gateway's JWT authorizer checks the `aud` claim by default,
which only ID tokens carry).

Item shape:
```json
{
  "id": "uuid",
  "title": "string",
  "description": "string",
  "images": ["https://<images-cdn-domain>/<uuid>.jpg", "..."],
  "featured": false,
  "order": 0
}
```

Response envelope: `{"success": true, ...}` on 2xx;
`{"success": false, "error": "..."}` or
`{"success": false, "errors": {"<field>": "<message>"}}` (validation, one
entry per invalid field, all at once) otherwise.

### Image upload flow

1. `POST /api/v1/admin/portfolio/upload-url` with `{"contentType": "image/jpeg"}`
   (allowed: jpeg/png/webp/gif) → `{uploadUrl, fields, publicUrl}`.
2. `POST` a `multipart/form-data` body (the returned `fields`, then the file
   as `file` — must be the **last** field) directly to `uploadUrl`. This
   goes straight to S3, not through API Gateway/Lambda.
3. Store `publicUrl` in the item's `images` array on create/update.

S3 enforces the constraints server-side via the presigned POST's
conditions (`content-length-range` up to 10MB, `Content-Type` must start
with `image/`) — not just a client-side check.

## Anti-abuse / cost control: route throttling

Every route has burst/steady-state limits set via the `CfnStage` L1 escape
hatch (CDK's `HttpApi` L2 doesn't expose per-route throttling). Public
`GET /api/v1/portfolio` gets the tightest limits (burst 10, rate 5/s) since
it's the only route with no Cognito gate; admin routes get looser limits
(burst 20, rate 10/s) since auth is already the primary control there. This
is the real defense against a runaway cost on `PAY_PER_REQUEST` billing —
not the billing mode itself.

## Deploy

```
cd infra
npm install
npx cdk bootstrap aws://<ACCOUNT_ID>/<REGION> --profile sj-web-studio   # one-time per account/region
npx cdk synth                                                            # optional sanity check
npx cdk deploy --all --profile sj-web-studio
```

Requires AWS CLI credentials (IAM Identity Center SSO, profile
`sj-web-studio` — same account as `sj-web-studio-clean`). Deploy
individually with `cdk deploy <StackName> --profile sj-web-studio` to
update one stack. Env-var overrides (`TABLE_NAME`, `DOMAIN_NAME`,
`ADMIN_SUBDOMAIN`, `ALLOWED_ORIGINS`) are documented in `.env.example` —
none are required for the defaults to work.

**Ordering matters**: `SjAdminCmsHostingStack`'s `BucketDeployment` reads
from `../out` (the Next.js static export), so `npm run build` at the repo
root must happen *before* deploying that stack, using the current
`.env.local` values (they get baked in at build time — this is a static
export, not a server that reads env vars at runtime). Use the `deploy`
skill to get this ordering right automatically.

**If `SjAdminCmsAuthStack` or `SjAdminCmsApiStack` are ever torn down and
redeployed**, Cognito and API Gateway will issue new IDs/URLs — re-sync
`.env.local` from the new outputs and rebuild/redeploy the hosting stack.

### First deploy of the hosting stack — manual DNS steps

Same watch-and-add-a-CNAME pattern as the main site:

1. `npx cdk deploy SjAdminCmsHostingStack --profile sj-web-studio` — pauses
   on the ACM certificate. Expected: it can't validate a domain it has no
   proof you control yet.
2. In a second terminal, find the pending cert and its validation record:
   ```
   aws acm list-certificates --region us-east-1 --profile sj-web-studio
   aws acm describe-certificate --certificate-arn <arn> --region us-east-1 --profile sj-web-studio
   ```
   Look at `DomainValidationOptions[0].ResourceRecord` (one record, just
   `admin.sjwebstudio.com` — no apex/bare-domain SAN needed here, unlike
   the main site's hosting stack).
3. Add that CNAME at the registrar (GoDaddy). Deploy resumes automatically
   once ACM validates — no re-run needed.
4. Once the stack finishes, read the `DistributionDomainName` output and
   add a second CNAME: `admin` → that value.
5. Verify `https://admin.sjwebstudio.com` loads with a valid cert.

Every deploy after that is just `npm run build` (repo root) then
`cdk deploy SjAdminCmsHostingStack --profile sj-web-studio` — sync and
CloudFront invalidation happen automatically via `BucketDeployment`.

## Creating an admin user

No public sign-up — every admin is provisioned manually:

```
aws cognito-idp admin-create-user --user-pool-id <UserPoolId> --username <email> \
  --user-attributes Name=email,Value=<email> Name=email_verified,Value=true \
  --message-action SUPPRESS --profile sj-web-studio --region us-east-1

aws cognito-idp admin-set-user-password --user-pool-id <UserPoolId> --username <email> \
  --password "<password>" --permanent --profile sj-web-studio --region us-east-1
```

`--permanent` on the password is required — without it the user lands in
`FORCE_CHANGE_PASSWORD` status and their first sign-in gets a
`NEW_PASSWORD_REQUIRED` challenge the app has no UI for (see CLAUDE.md's
Known Constraints). Password policy: 12+ characters, upper, lower, digit,
symbol.

**Resetting a forgotten password** today is the same
`admin-set-user-password --permanent` command — there's no self-service
reset flow yet.

**MFA**: optional, self-service via `/settings` once logged in (TOTP only,
no SMS). To force-disable MFA on a user (e.g., they lost their
authenticator app):
```
aws cognito-idp admin-set-user-mfa-preference --user-pool-id <UserPoolId> --username <email> \
  --software-token-mfa-settings Enabled=false,PreferredMfa=false --profile sj-web-studio --region us-east-1
```

## Test

```
curl https://<ApiUrl>/api/v1/portfolio
```

Expect `200` and `{"success":true,"items":[...]}` with no auth header.
Then confirm, via the running app:
- Create/edit/delete a portfolio item; each change is immediately visible
  via the public GET above.
- CloudWatch Logs for all 5 Lambdas contain only ids/timestamps/error
  names — never title/description content.
- The images S3 bucket has no public access — only reachable through its
  CloudFront distribution.
- A burst of requests against the public GET route eventually gets `429`
  (throttling engaged) rather than every request succeeding.
- MFA round-trip: enroll via `/settings`, log out, log back in — the
  6-digit challenge appears and a valid code from the authenticator app
  completes sign-in.
