# Tonight's review list (from the cloud session, 2026-11-19)

Things that need you. Delete this file once each item is done or moved into a spec.

## 1. Visitor counter (V1-14, moved out of v1)

Planned in ADR-0004 for v1.1. Nothing is built yet. Decisions and actions for tonight:

- **Shape** (from ADR-0004): a Cloudflare Pages Function at `/api/visits` with a D1 database. It counts unique
  visitors per day: a salted daily hash of the visitor, never the IP itself; atomic increment; one count per
  visitor per day. Shown in the footer in monospace, e.g. `visitors.total 4,218 · today 37`.
- **You decide**:
  1. Ship it in v1.0 (Sunday) or v1.1 (~29 Nov)? I recommend v1.1, so the launch does not wait on new infrastructure.
  2. Create the D1 database in the Cloudflare dashboard (free plan), and the binding name (suggest `VISITS_DB`).
  3. Create a secret for the daily salt (suggest `VISIT_SALT`), set in Cloudflare, never in the repo.
  4. Footer wording, and a one-line privacy note ("counted with a daily salted hash; no cookies, no IPs stored").
- **Then I do** (tests first): hashing (salt, daily rotation, no raw IP kept), counting (atomic, one per visitor
  per day), the Function, the footer component, and a security review of the endpoint (rate limit, CORS).

## 2. Resume PDF

No `resume.pdf` exists on any branch. Add it as `apps/web/public/resume.pdf` (no phone number). Until then the
resume links on Home, About and Contact show the 404 page. V1-08 stays open until it is in.

## 3. Hook change to review

`.claude/hooks/guard-bash.mjs`: the "secret environment variable" rule was case-insensitive, so a lower-case
JS placeholder like `${tokens}` was blocked as if it were `$GITHUB_TOKEN`. Now POSIX names are matched
case-sensitively (upper-case secrets still blocked); Windows `$env:` and `%VAR%` stay case-insensitive.
Tests: `.claude/hooks/guard-bash.test.mjs` (run with `npm run test:hooks`).

## 4. Release (V1-13)

1. Cloudflare Pages: connect the repo. Root `apps/web`, build `npm ci && npm run build`, output
   `dist/web/browser`, production branch `main`, preview from `develop`.
2. On the first preview, check whether `/experience` redirects to `/experience/`. If it does, the canonical
   URLs and the sitemap should use the trailing slash.
3. Domain, DNS and Email Routing for hello@siddheshfulawade.com.
4. Then the agent runs `/release` (it runs `/review`) and opens the release PR to `main` for your merge.

## 5. Small open items

- PennyWise repo URL (for `content/projects/pennywise.md`).
- Wording of the UI labels added on day 2 ("Track record", "Featured work", "Get in touch").
- Correction to the day-2 PR: hydration event replay is **on** (Angular's default), so taps before hydration are
  replayed, not lost. It ships two small inline scripts per page; fine for v1 (no CSP yet). For the v1.1
  security headers, use Angular `autoCsp` (it hashes them) or turn event replay off. Details: `docs/v1-release-review.md`.

## 6. Release review

`docs/v1-release-review.md`: no must-fix findings. Before merging the release PR: add `resume.pdf`, and check
canonical URLs against Cloudflare's trailing-slash behaviour on the preview.
