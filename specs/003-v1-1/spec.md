# 003 · v1.1 · Spec

Release v1.1, target Sun 29 Nov 2026 (ADR-0004). One spec, approved once.

## 1. Goal

After launch, the site gets the parts that make it trustworthy and measurable: a public visitor counter
that stores no personal data, cookieless analytics for the owner, a Notes section with two or three short
technical articles that give interviewers something to ask about, an A+ security header set, and one CI
workflow so every pull request is checked before it reaches `develop`.

## 2. Requirements (EARS)

### Visitor counter

- REQ-COUNT-001 THE site SHALL show a visitor counter in the footer: total unique visitors and today's unique
  visitors, numbers in monospace and international format (for example `visitors.total 4,218 · today 37`).
- REQ-COUNT-002 WHEN a page loads in a browser, THE counter endpoint `/api/visits` SHALL record at most one visit
  per visitor per UTC day and return the current totals.
- REQ-COUNT-003 THE endpoint SHALL identify a visitor only by a hash of (daily salt, IP address), with IPv6
  addresses cut to their /64 prefix; the raw IP SHALL never be stored or logged, and the salt SHALL change every
  UTC day. (Amended 2026-11-23 after the v1.0.0 security review: hashing the user agent let one IP inflate the
  counter by rotating it.)
- REQ-COUNT-004 THE increment SHALL be atomic: concurrent first visits of different visitors are all counted,
  and concurrent repeat visits of one visitor are counted once.
- REQ-COUNT-005 IF the endpoint fails or is slow, THEN THE footer SHALL keep the page usable and show no number
  (no error text, no layout shift).
- REQ-COUNT-006 THE endpoint SHALL accept only `GET` and `POST` from the site's origin, reject other methods with
  RFC 9457 problem details, and be rate-limited.
- REQ-COUNT-007 THE endpoint SHALL record visits only for requests whose host is a configured site host
  (`siddheshfulawade.com`, `www.siddheshfulawade.com`, `portfolio-7qt.pages.dev`); other hosts (preview
  aliases) get the totals without a write. A visitor already counted today SHALL cost one read and no write.
  Function responses SHALL carry `x-content-type-options: nosniff` and `cross-origin-resource-policy: same-site`.

### Analytics

- REQ-ANA-001 THE site SHALL use Cloudflare Web Analytics (no cookies, no personal data) on production only.

### Notes

- REQ-NOTE-001 THE site SHALL have `/notes` (published notes, newest first) and `/notes/:slug` (one prerendered page
  per published note) rendered from `content/notes/*.md`, with title, date, reading time and tags.
- REQ-NOTE-002 Notes SHALL appear in the navigation, the sitemap and per-route SEO meta like other pages.
- REQ-NOTE-003 Notes SHALL follow the disclosure rules: no employer internals, volumes or throughput figures.

### Security headers

- REQ-SEC-001 THE site SHALL send a hash-based Content Security Policy with no `'unsafe-inline'` or `'unsafe-eval'`,
  plus HSTS (2 years, includeSubDomains, preload), `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`,
  `Cross-Origin-Opener-Policy: same-origin` and `frame-ancestors 'none'`.
- REQ-SEC-002 THE production site SHALL score A+ on Mozilla Observatory and securityheaders.com.

### CI

- REQ-CI-001 WHEN a pull request targets `develop` or `main`, THE CI workflow SHALL run install, content check, lint,
  typecheck, unit and script tests, build, the Playwright smoke test and `npm audit --omit=dev`, and fail on any error.
- REQ-CI-002 THE workflow SHALL pin every action by commit SHA and grant least-privilege `permissions:`.

### Carried over from the v1 review

- REQ-SEO-003 Canonical URLs and the sitemap SHALL match the URL form Cloudflare Pages serves (with or without a
  trailing slash), so no canonical URL redirects.

Non-functional: budgets unchanged (performance ≥95, LCP ≤1.8 s, CLS ≤0.05, initial JS ≤120 KB gzipped); the
counter loads after first paint and adds no more than 2 KB gzipped to the initial bundle; running cost stays at
the domain only (Cloudflare free plan: Pages Functions, D1, Web Analytics).

## 3. Design (short)

- **Counter Function** (`apps/web/functions/api/visits.ts`, Cloudflare Pages Function): `POST` records a visit and
  returns `{ total, today }`; `GET` returns the totals. Pure modules with unit tests (Vitest, no network):
  `visitor-hash.ts` (SHA-256 over salt and IP, IPv6 cut to /64, with Web Crypto; salt derived per UTC day from a secret,
  `VISIT_SALT`, so yesterday's hashes cannot be linked to today's) and `visit-store.ts` (D1 queries).
- **Data (D1, binding `VISITS_DB`)**: `daily_visitors(day TEXT, visitor_hash TEXT, PRIMARY KEY(day, visitor_hash))`
  and `totals(day TEXT PRIMARY KEY, unique_visitors INTEGER)`. One visit is
  `INSERT OR IGNORE INTO daily_visitors`, and only when a row was inserted, an upsert that increments `totals`,
  both in one D1 `batch` (a single transaction), which gives REQ-COUNT-004. Rows in `daily_visitors` older than
  2 days are deleted by the same request (no scheduled job needed). Migration in `apps/web/migrations/0001_visits.sql`.
- **Footer counter** (`core/layout/visitor-counter.component.ts`): `@defer (on idle)`; calls the endpoint with
  `fetch` (no HttpClient in the initial bundle), fixed-width slot so nothing shifts, hidden on error (REQ-COUNT-005).
  Not rendered during prerender. Labels come from `site.yaml`.
- **Rate limit**: Cloudflare WAF rate rule on `/api/*` (dashboard, user action) plus a per-hash guard: a visitor that
  is already counted today costs one read.
- **Analytics**: Cloudflare Web Analytics enabled for the Pages project in the dashboard (automatic beacon on
  production only). The CSP allows its script and beacon hosts.
- **Notes**: `content/notes/<slug>.md` with front matter `id, published, updated, title, summary, date, tags`;
  a schema in `content/_schema/note.schema.json`; the content build adds notes (reading time computed at build),
  the sitemap and prerender params; `features/notes/` list and detail pages reuse `.prose` and `SeoService`.
- **Headers**: `apps/web/public/_headers` for Cloudflare Pages. CSP hashes come from Angular `autoCsp`
  (`security.autoCsp` in `angular.json`), which also covers the hydration event-replay inline scripts found in the
  v1 review; the theme-init script is external and covered by `script-src 'self'`. A post-build check fails the
  build if any HTML file has an inline script whose hash is not in the CSP.
- **CI** (`.github/workflows/ci.yml`): one job on `ubuntu-latest`, Node from `.nvmrc`, `npm ci`, `npm run verify`,
  Playwright Chromium install and `npm run e2e`. Actions pinned by SHA; `permissions: contents: read`.
- **Decisions**: the counter is a Pages Function, not a separate Worker, so it ships with the site and needs no
  extra deploy. D1 over KV because KV has no atomic increment. No cookies and no localStorage for counting.
- **Dependencies**: no new runtime dependency. One dev-only addition, `@cloudflare/workers-types` (type definitions
  for the Function), approved by approving this spec. No `wrangler` in the repo: tests use an in-memory D1 stand-in,
  and the migration is applied from the Cloudflare dashboard.
- **Risks**: `autoCsp` and hydration together are new in Angular 22: test on the preview before the release.
  A D1 outage must not break pages (REQ-COUNT-005). Cloudflare Web Analytics injection must not add an inline
  script that the CSP blocks: check on the preview.

## 4. Tasks

Branch per day: `feature/v1.1-day-N` from `develop`, one PR per day.

### Day 1: CI and headers

- [x] V11-01 [infra] CI workflow (REQ-CI-001, 002). Tests first: none (the workflow is the test). Checks: a PR with a
      failing unit test is red; a clean PR is green; every `uses:` is pinned by a 40-character SHA.
- [x] V11-02 [web] Security headers and CSP (REQ-SEC-001). Tests first: a script test that parses `_headers` for every
      required header; the post-build inline-script hash check. Checks: smoke test green with the CSP enforced by the
      local server; no CSP violations in the console.

### Day 2: visitor counter

- [x] V11-03 [web] Counter Function and D1 migration (REQ-COUNT-002, 003, 004, 006). Tests first: hashing (same
      visitor same day gives the same hash; a new day gives a different hash; the raw IP never appears in what is
      stored), counting (first visit counts, repeat visit does not, concurrent visits counted once each, using an
      in-memory D1 stand-in), method and origin checks, problem details.
- [x] V11-04 [web] Footer counter component (REQ-COUNT-001, 005). Tests first: renders formatted numbers; renders
      nothing on error; no layout shift. Checks: initial bundle grows by ≤2 KB gzipped.
- [ ] V11-05 [infra] **User actions**: create the D1 database, bind it as `VISITS_DB`, set the `VISIT_SALT` secret,
      apply the migration, add the WAF rate rule, enable Web Analytics (REQ-ANA-001). Checks: counter works on the preview.

### Day 3: Notes

- [x] V11-06 [web] Notes schema, content build, list and detail pages, navigation, sitemap and SEO
      (REQ-NOTE-001, 002). Tests first: content build tests for notes (validation, unpublished dropped, newest first,
      reading time); unit tests for both pages. Checks: smoke test covers the new routes.
- [ ] V11-07 [content] Two or three notes drafted for the user's approval (REQ-NOTE-003). Checks: the content build's
      disclosure rules pass; the user approves each note before `published: true`.
      Status: two drafts committed with `published: false` (topics a and b from §6); waiting for the user's review and approval.
      2026-11-23: disclosure check passed; publish PR open, not merged until the user approves the content.

### Day 4: release

- [ ] V11-08 [web] Trailing-slash fix if the v1 preview showed redirects (REQ-SEO-003), observatory and
      securityheaders checks (REQ-SEC-002), Lighthouse re-run, `/release` v1.1.0.
      Status: trailing-slash part done 2026-11-22 (preview answers `/about` with 308 to `/about/`; canonical, `og:url` and
      sitemap now end in a slash). Observatory, securityheaders and Lighthouse wait for the live domain.

## 5. Out of scope

Contact form, the `/lab` dashboard and the Settlement Lab API (v2); Engineering page, generated resume and
Lighthouse CI (v2.1); Renovate (later, own ADR); comments and newsletters (never, per the brief).

## 6. Open questions for the user

**Still open** (the user is away from a laptop; answer tonight). Until answered, the defaults in brackets apply,
and no task that depends on an answer is started.

1. [Footer only] Counter placement: footer only (as designed), or also on Home?
2. Notes topics: suggested (a) exactly-once processing without distributed transactions, (b) ordered locking vs
   CAS in the Settlement Lab ledger, (c) what a JSON Schema content pipeline buys a static site. Which two or three? [Drafted (a) and (b) as unpublished notes for review; (c) not written.]
3. Should v1.1 also split project write-ups out of the main bundle (initial JS is 87 KB of 120 and grows with notes)? [No split in v1.1 unless initial JS passes 100 KB.]

Progress (2026-11-19, cloud session; the user asked from mobile to keep going and decide routine questions):

- Done: V11-01 CI, V11-02 headers, V11-06 notes pages, V11-03 counter endpoint, V11-04 footer counter (code and
  tests; it shows nothing until the D1 database exists).
- Drafted, waiting for the user: V11-07 (two notes, unpublished).
- User actions: V11-05 (D1 database, secret, migration, WAF rule, Web Analytics). Then V11-08 on the live site.
- Approved by the user on 2026-11-22 with the §6 defaults (footer only, two drafted topics, no bundle split).

Status: APPROVED (2026-11-22, user approved with the §6 defaults)
