# 2026-11-21 · v1 day 3: Projects, About, Contact, smoke test (cloud session)

**Done**

- PR #14 (day 2) merged to `develop` on the user's go-ahead. The user then delegated PR decisions to the agent.
- V1-07 Projects list and per-slug pages (8 prerendered routes then 10 with About and Contact). V1-08 About and Contact.
  V1-09 Playwright smoke test (12 tests: every route 200, one `h1`, no console errors, no serious axe; 404; 320 px; keyboard menu path).
- `npm run verify` green: 55 unit tests, 66 script tests; initial JS 86.4 KB gzipped. `npm run build && npm run e2e` green.

**State**

- V1-08 and V1-09 stay unticked in `spec.md`: their remaining parts are user actions.
- Playwright 1.63.0 matches the browser in the cloud image; on Windows run `npx playwright install chromium` once.

**Next (Sunday)**: V1-11 SEO (per-route meta, OG, canonical, sitemap, robots), V1-12 mobile and a11y pass, V1-10 write-up check.
V1-13 release to `main` waits for the user (domain, DNS, Email Routing).

**User actions**

1. Add `apps/web/public/resume.pdf` (no phone number). 2. Connect the repo to Cloudflare Pages: root `apps/web`,
   build `npm ci && npm run build`, output `dist/web/browser`, preview from `develop`. 3. PennyWise repo URL (from day 1).
