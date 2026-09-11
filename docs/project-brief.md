# Project Brief — sj-admin-cms

## Why this exists

S&J Web Studio builds low-cost, low-maintenance sites for small-business
clients — the pitch is explicitly *not* WordPress: no plugin ecosystem, no
CVE exposure, no ongoing patching burden, hosting that stays near
$0/month on AWS's free tiers. That pitch falls apart the moment a client
needs to self-edit content, which is where WordPress usually wins on
convenience. This project closes that gap: a minimal, purpose-built admin
tool for the handful of content types a typical client actually needs to
touch themselves.

## What it does today

Manages the portfolio section of `sjwebstudio.com` — S&J's own marketing
site. An admin logs in, and can list, add, edit, and delete portfolio
items (title, description, up to 20 images, featured flag, display order).
Images are cropped/fitted client-side to a fixed size before upload, so the
public gallery never shows a jarring size mismatch between projects.

## Who uses it

One or two people at S&J (Sean & Juanita) today. The reusable-template goal
means future client deployments will each have their own 1-2 admin users —
never a large user base, which is why MFA is optional rather than
enforced, and why there's no self-service invite/signup flow.

## Scope boundaries

- **In scope for this repo**: the admin tool itself — auth, CRUD, image
  handling, hosting.
- **Explicitly out of scope**: making `sj-web-studio-clean` (the marketing
  site) actually *consume* this data. That's a separate task in a
  different repo, requiring its own review before starting.
- **Explicitly out of scope**: a general-purpose CMS. This manages exactly
  one content type (portfolio items) for v1 — future clients with
  different content needs (announcements, program listings, etc.) are
  expected to fork and adapt the schema/Lambdas, not use this as a
  fully generic no-code tool.

## Reference

See `CLAUDE.md` for how to work in this codebase (conventions, template
parameterization, AWS/security rules) and `infra/README.md` for the deploy
runbook and API reference.
