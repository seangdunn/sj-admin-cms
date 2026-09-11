# sj-admin-cms

Lightweight admin CMS for managing portfolio content on
[sjwebstudio.com](https://sjwebstudio.com) — a self-hosted, near-$0/month
alternative to giving a client WordPress just so they can edit a few pieces
of content. See `docs/project-brief.md` for the full "why."

Live at **https://admin.sjwebstudio.com**.

## Repo structure

```
├── CLAUDE.md               Project memory for Claude Code — conventions, read this first
├── docs/project-brief.md   Business context — why this exists, scope boundaries
├── app/                    Next.js App Router pages (static export)
├── components/             React components
├── lib/                    Auth, API client, session, upload helpers
└── infra/                  AWS CDK app (Cognito + API + hosting) — see infra/README.md
```

## Local development

```
npm install
cp .env.example .env.local   # fill in from `cdk deploy` outputs — see infra/README.md
npm run dev
```

Requires a deployed backend (Cognito + API) to actually sign in and load
data — there's no local mock/emulation layer.

## Deploy

See `infra/README.md` for the full deploy runbook (CDK stacks, first-deploy
manual DNS steps, admin user creation). Short version:

```
cd infra
npm install
npx cdk deploy --all --profile sj-web-studio
```

Or use the `deploy` skill, which handles the build → deploy → `.env.local`
sync ordering.

## Template reuse

This repo is designed to be forked for future clients who only need to
manage a small amount of content. See `CLAUDE.md`'s "Template / Reusability
Conventions" for exactly which values are parameterized, and the
`new-client-fork` skill for the concrete checklist.
