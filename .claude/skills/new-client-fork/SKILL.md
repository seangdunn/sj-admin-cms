---
name: new-client-fork
description: Checklist for forking sj-admin-cms into a new, independent deployment for a different client. Use when the user wants to set up this admin CMS for a new client/project, not just redeploy the existing S&J instance.
---

# Fork sj-admin-cms for a New Client

This repo is a template — every value that varies per deployment is
parameterized (see `CLAUDE.md`'s "Template / Reusability Conventions"
table for the authoritative list). Forking is a config change, not a
rewrite, but every one of these needs to actually be changed or the new
deployment will collide with or leak into the original.

## Checklist

1. **New repo**: `gh repo create <owner>/<client>-admin-cms --public --source=. --remote=origin`
   (or private, if the client doesn't want their infra public — unlike
   S&J's own instance, there's no inherent reason a client fork needs to
   be public).

2. **`infra/bin/infra.ts` env-var overrides** (set via `infra/.env` or
   your shell before `cdk deploy` — see `infra/.env.example`):
   - `TABLE_NAME` — rename from `portfolio-items` if the client's content
     type differs (this schema is portfolio-specific; a client managing
     something else, e.g. announcements, needs a different schema and
     different Lambda validation logic too — this is a fork-and-adapt
     point, not just a rename).
   - `DOMAIN_NAME` / `ADMIN_SUBDOMAIN` — the client's own domain.
   - `ALLOWED_ORIGINS` — update if left at the derived default.

3. **`app/globals.css`** — swap `--color-accent` to the new client's
   brand color, or leave it generic if they don't have one.

4. **CDK stack IDs** (`infra/bin/infra.ts`) — rename
   `SjAdminCms*Stack` to `<Client>AdminCms*Stack` so CloudFormation stack
   names don't collide if this ever shares an AWS account with another
   deployment.

5. **AWS account/profile** — decide same account (different stack names
   are enough isolation) or a separate account (cleaner billing/blast-radius
   separation for a client relationship). Configure a new AWS CLI profile
   if the latter.

6. **Deploy** — see the `deploy` skill for the build/deploy ordering.

7. **First admin user** — `admin-create-user` + `admin-set-user-password
   --permanent` for the client's own admin, per `infra/README.md`. Don't
   reuse S&J's own credentials or Cognito pool.

8. **Sweep for leftover literals** — grep the fork for `sj-`, `sjwebstudio`,
   and `S&J` that should have been parameterized but got missed (page
   titles, `<h1>` copy in `app/login/page.tsx`/`app/settings/page.tsx`,
   `README.md`'s live-URL line, `docs/project-brief.md`'s "why this
   exists" framing if it's genuinely a different business).

## What's schema-specific and needs real adaptation, not just renaming

If the new client needs to manage something other than a portfolio
(announcements, program listings, etc.), the DynamoDB item shape, the 4
CRUD Lambdas' validation logic, `lib/types.ts`'s `PortfolioItem` interface,
and the form/table components all need real changes — this checklist
covers *infrastructure* parameterization, not a full port to a different
content model. Treat that as its own scoped task.
