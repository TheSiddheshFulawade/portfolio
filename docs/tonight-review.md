# Tonight's review list (from the cloud session, 2026-11-19)

Things that need you. Delete this file once each item is done or moved into a spec.

## Status at a glance

- **v1 site**: built and merged to `develop` (PRs #14, #15, #16). Release review: no must-fix findings.
- **v1.1 (spec 003, still DRAFT)**: built in the same session at your request: CI, security headers, notes pages,
  the visitor counter (code) and two note drafts. Waiting for you: approval of spec 003, the Cloudflare setup
  for the counter (§1), and the note drafts (§2).
- **Waiting on you for the v1.0.0 release**: `resume.pdf` (§3), Cloudflare Pages, domain, DNS and Email Routing
  (§5). Then the agent opens the release PR to `main`; you merge it.
- `develop` now holds v1 plus the v1.1 work above. Everything that needs setup stays invisible until it is set
  up (the counter answers "204 No Content" and shows nothing; notes stay hidden while unpublished), so a release
  from `develop` is safe before tonight's actions.

## 1. Visitor counter: built, needs Cloudflare setup (V11-05)

- **Built** (V11-03, V11-04): `apps/web/functions/api/visits.ts`, logic and 16 tests in `apps/web/server/visits/`,
  migration `apps/web/migrations/0001_visits.sql`, footer component. A visitor is only
  `SHA-256(HMAC(secret, UTC day) | IP | user agent)`; the IP is never stored or logged; hashes are deleted
  after two days; daily counts are kept. POST is accepted only from the site's own origin.
- **Your actions** (Cloudflare dashboard, free plan):
  1. Workers and Pages → D1 → create a database (e.g. `portfolio-visits`).
  2. In the Pages project → Settings → Bindings: add a D1 binding named **`VISITS_DB`** to that database
     (production and preview).
  3. Settings → Variables and secrets: add a **secret** named **`VISIT_SALT`** with a long random value
     (production and preview). Never put it in the repo.
  4. D1 → the database → Console: paste and run `apps/web/migrations/0001_visits.sql`.
  5. Security → WAF → rate limiting rule for `/api/*` (for example 30 requests per minute per IP).
  6. Web Analytics: enable it for the Pages project (REQ-ANA-001). The CSP already allows its hosts.
- **Your decisions**: footer only (current) or also on Home? Add a privacy line under the counter
  ("counted with a daily salted hash; no cookies, no IPs stored")?
- **Check after setup**: the footer shows `visitors.total … · today …` on the preview; a second reload does not
  raise "today".

## 2. Notes: two drafts to review (V11-07)

`content/notes/exactly-once-without-distributed-transactions.md` and `content/notes/ordered-locking-versus-cas.md`,
both `published: false`. Edit freely; set `published: true` on each one you approve. The Notes link, pages and
sitemap entries appear automatically once one note is published. Topic (c), the content pipeline, is not written.

## 3. Resume PDF

No `resume.pdf` exists on any branch. Add it as `apps/web/public/resume.pdf` (no phone number). Until then the
resume links on Home, About and Contact show the 404 page. V1-08 stays open until it is in.

## 4. Spec 003 approval and its open questions

`specs/003-v1-1/spec.md` §6: counter placement (default: footer only), note topics (two drafted), bundle split
(default: not unless initial JS passes 100 KB; it is 87.9 KB). Approve the spec, or say what to change.

## 5. Release (V1-13)

1. Cloudflare Pages: connect the repo. Root `apps/web`, build `npm ci && npm run build`, output
   `dist/web/browser`, production branch `main`, preview from `develop`.
2. On the first preview, check whether `/experience` redirects to `/experience/`. If it does, the canonical
   URLs and the sitemap should use the trailing slash (V11-08).
3. Domain, DNS and Email Routing for hello@siddheshfulawade.com.
4. Then the agent runs `/release` (it runs `/review`) and opens the release PR to `main` for your merge.
5. On the live domain: Mozilla Observatory and securityheaders.com (target A+), Lighthouse re-run (V11-08).

## 6. Small open items

- PennyWise repo URL (for `content/projects/pennywise.md`).
- Wording of the UI labels added on day 2 ("Track record", "Featured work", "Get in touch").
- Hook change (PR #17, merged): `guard-bash` now matches POSIX secret names case-sensitively; upper-case secrets
  and all Windows forms are still blocked. Tests in `.claude/hooks/guard-bash.test.mjs`.
- Correction to the day-2 PR: hydration event replay is on (Angular's default), so taps before hydration are
  replayed. Its inline scripts are allowed by hash in the CSP (V11-02).
- CI: GitHub's Chromium install step sometimes takes several minutes (apt); the rest of CI takes about 20 s.
