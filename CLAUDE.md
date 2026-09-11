# CLAUDE.md

## Project

Admin CMS for managing S&J Web Studio's portfolio content (title, description,
images, featured/order) — the Next.js dashboard `sj-web-studio-clean`'s own
`CLAUDE.md`/`main.js` already anticipated, so its public read API is a seam
that repo depends on (see "Design for Future Consumer" below).

Beyond S&J's own use, **this repo is meant to become a reusable template**:
future clients who only need to edit 2-3 pieces of content get a fork of this
instead of a WordPress install — avoiding plugin/CVE exposure and keeping
hosting near $0/month. That goal is a first-class constraint, not an
afterthought: see "Template / Reusability Conventions" below for exactly
which values must stay parameterized.

## Tech Stack

- Frontend: Next.js (App Router, static export — `output: 'export'`, no
  server) + TypeScript + Tailwind CSS v4
- Auth: Cognito User Pool, `@aws-sdk/client-cognito-identity-provider`
  (`USER_PASSWORD_AUTH`), TOTP MFA (optional, self-service via `/settings`)
- Backend: API Gateway (HTTP API) → Lambda (TypeScript, SDK v3) → DynamoDB
- Images: S3 (private) + CloudFront (OAC), presigned POST uploads
- Hosting: S3 + CloudFront + ACM, same pattern as `sj-web-studio-clean`

## Commands

Frontend (repo root):
```
npm install
npm run dev      # local dev server, reads .env.local
npm run build    # static export to out/
npm run lint
```

Infra (`infra/`, a fully separate npm package):
```
cd infra
npm install
npx cdk synth                                              # sanity check
npx cdk deploy <StackName> --profile sj-web-studio          # one stack
npx cdk deploy --all --profile sj-web-studio                # all three
```

Use the `deploy` skill for the full build → deploy → `.env.local` sync
sequence — the ordering matters (see that skill for why).

## Architecture

- `app/` — routes: `/login`, `/settings` (MFA), `/portfolio` (list),
  `/portfolio/new`, `/portfolio/edit?id=` (query param, not a dynamic
  segment — static export can't `generateStaticParams` for content that
  only exists in DynamoDB post-deploy)
- `components/` — `AuthGuard` (redirect-if-unauthenticated wrapper),
  `PortfolioForm`/`PortfolioTable`, `ImageCropper` (crop-to-fixed-ratio
  or fit-with-fill), `MfaSetup`/`MfaChallengeForm`
- `lib/` — `cognito.ts` (auth + MFA calls), `session.ts` (sessionStorage),
  `api-client.ts` (fetch wrapper, attaches the bearer token), `uploads.ts`
  (presigned-POST flow), `types.ts`, `env.ts`
- `infra/` — CDK app, kept fully separate from the frontend (own
  `package.json`/`tsconfig.json`); `lib/` (3 stacks), `lambda/` (5
  functions), `bin/infra.ts` (entry point, reads env-var overrides)

## Template / Reusability Conventions

Values that **must** stay parameterized (env var / CDK context / a single
CSS variable — never hardcoded) so a client fork is a config change, not a
code change:

| Value | Where | Default |
|---|---|---|
| DynamoDB table name | `infra/bin/infra.ts` `TABLE_NAME` | `portfolio-items` |
| Apex domain | `infra/bin/infra.ts` `DOMAIN_NAME` | `sjwebstudio.com` |
| Admin subdomain | `infra/bin/infra.ts` `ADMIN_SUBDOMAIN` | `admin.sjwebstudio.com` |
| CORS allowed origins | `infra/bin/infra.ts` `ALLOWED_ORIGINS` | derived from subdomain + localhost |
| Accent color | `app/globals.css` `--color-accent` | `#12353b` (main site's deep-teal) |
| CDK stack IDs | `infra/bin/infra.ts` | `SjAdminCms*Stack` — rename per client |

S3 bucket names are **not** in this list — deliberately left CDK-generated
(no explicit `bucketName`) so a fork never collides with this account's
buckets on S3's global namespace.

See the `new-client-fork` skill for the full fork checklist.

## Design for Future Consumer

This CMS's public read route, `GET /api/v1/portfolio`, is itself a seam
`sj-web-studio-clean` is meant to consume (see that repo's own
`CLAUDE.md`/`main.js` comments — it pre-planned for this). Keep API
versioning (`/api/v1/...`) and the response shape (`{success, items: [...]}`)
stable; a breaking change there breaks a different repo's build, not just
this one. Wiring the marketing site to actually call it is a separate,
explicitly-approved task — not assumed in scope here (see Known
Constraints).

## Code Philosophy

- Prefer the simplest solution that solves the actual problem. This
  project's own build already has two concrete examples worth following:
  full `Scan` + in-Lambda sort instead of a GSI (item counts are small),
  and client-side crop-to-fixed-size instead of a `sharp` Lambda pipeline
  (avoids native-binary bundling complexity entirely).
- When a request is ambiguous between a simple fix and a more robust one,
  propose the simple fix first and name the tradeoff — don't silently
  implement the more complex version.
- Small, single-purpose Lambdas named for what they do
  (`create-portfolio-item`, not `handler.ts`) — no shared Lambda utility
  module; a ~10-line `jsonResponse` helper duplicated across 5 files is
  cheaper than a shared module that couples otherwise-independent
  functions together.

## Naming Conventions

- **Files**: kebab-case for non-component files (`api-client.ts`,
  `create-portfolio-item.ts`); **PascalCase for React component files**
  (`PortfolioForm.tsx`) — an explicit carve-out from `sj-web-studio-clean`'s
  blanket kebab-case rule, matching standard React/Next.js convention.
- **CSS/JS/TS**: kebab-case for CSS custom properties (`--color-accent`);
  camelCase for JS/TS variables and functions — standard per-language
  convention.
- No typos ship, ever. Flag and fix opportunistically if you notice one
  while working on something else, rather than reproducing it.

## Working Autonomy

If a change is clearly covered by an existing rule in this file, just apply
it — don't pause to propose it first. Before implementing anything genuinely
new or structural, propose a short plan and wait for approval. The bar is
"does an existing rule already answer this," not "is this a big change."

## Git & Commit Workflow

- Like `sj-web-studio-clean`, this is a **public** repo — commit history
  should read as intentional, not exploratory.
- Never run `git commit` or `git push` unless explicitly asked to in that
  turn.
- One logical change per commit. Don't bundle unrelated fixes.
- Imperative mood, real context (`"Fix Link prefetch 404s on static
  export"`, not `"fix bug"`).
- The pre-commit hook (`.githooks/pre-commit`, installed via
  `git config core.hooksPath .githooks`) blocks commits containing AWS
  access keys, ARNs, or 12-digit account IDs. Runs automatically — don't
  rely on remembering this rule manually.

## AWS & Backend Conventions

- Lambdas: small, single-purpose, named for what they do.
- IAM: least-privilege **per resource** via `addToRolePolicy` with an
  exact `PolicyStatement` — never `grantReadWriteData()`/`grantPut()`-style
  broad helpers.
- Validate and sanitize all input server-side in the Lambda — never trust
  client-side validation alone. Accumulate all field errors in one pass
  (`{errors: Record<string,string>, value: T|null}`) rather than failing
  fast, so the UI can show every problem at once.
- Never log PII or content at INFO level — only ids, timestamps, and error
  names/messages. This includes MFA: log the Cognito error name/message on
  a failed challenge, never the code itself or the user's email.
- API Gateway HTTP APIs, not REST APIs.
- Never attach a Lambda to a VPC in this project.
- Never hardcode AWS credentials, ARNs, account IDs, or endpoint URLs —
  env vars / `.env.example`, confirm `.env*` stays gitignored.
- Never widen the Cognito authorizer beyond `/api/v1/admin/*`.
- Image uploads always go through S3 **presigned POST** (server-enforced
  `content-length-range` + `starts-with $Content-Type image/` conditions)
  — never a presigned PUT with only client-side checks, and never a Lambda
  proxying raw file bytes through API Gateway.
- Never use `dangerouslySetInnerHTML` on admin-entered content.
- Route-level throttling (via the `CfnStage` L1 escape hatch — CDK's L2
  `HttpApi` doesn't expose per-route throttling) is a required control on
  every route, not optional polish — tightest on the one unauthenticated
  route (`GET /api/v1/portfolio`).

## Cost Awareness

- Default to Always Free tier (Lambda, DynamoDB) and 12-month free tier
  (S3, CloudFront) resources. Cognito's free tier (50 MAUs on the classic
  tier) also applies — this is the first S&J project actually using
  Cognito, so it's worth calling out explicitly rather than assuming.
- Flag before creating any resource outside the free tiers.
- Never provision infrastructure "just in case."

## Known Constraints / Do Not Touch

- **Marketing-site integration is out of scope here.** `sj-web-studio-clean`'s
  existing `portfolio.json` pattern is keyed by hardcoded case-study slug
  and only carries gallery media — it doesn't map 1:1 onto this table's
  full CRUD item list. Wiring that repo to call `GET /api/v1/portfolio` is
  a separate, explicitly-approved follow-up task, not assumed here.
- **No Cognito Hosted UI** — direct password auth from the SPA, by design
  (see the plan's Frontend Auth rationale: Amplify is unjustified weight
  for a 1-2 user login form).
- **No self-service password reset or change-password screen exists yet.**
  The only way to reset a forgotten admin password today is re-running
  `admin-set-user-password --permanent` via the AWS CLI (see
  `infra/README.md`). Fine for a tiny known admin base in v1, but a real
  gap if this template ever needs to support a client who can't call AWS
  CLI themselves.
- **`NEW_PASSWORD_REQUIRED` challenge is intentionally unhandled** — every
  admin user must be created via `admin-create-user` +
  `admin-set-user-password --permanent` (never leaving a temporary
  password), so the app never encounters this challenge. Skipping the
  screen is a deliberate v1 simplification.
