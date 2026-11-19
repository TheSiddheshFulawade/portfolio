# 0004 · Fast track: v1 live by Sunday 22 Nov 2026

## Status

Accepted (2026-11-19, user decision). Supersedes ADR-0003. Amends the constitution (1.2–1.6, 2.2,
2.4, 2.5, §3, §4, 5.3, 5.4).

## Context

The blueprint plans 18 specs over about 4 weeks. After three days, spec 001 (tooling) was 7 of 19 tasks done,
and most of the time had gone into process. The user needs v1 live by Sunday 22 Nov 2026, and after that most
of their time goes to interview prep. The blueprint is too big for that timeline.

## Decision

### Releases

| Release | Target     | Scope                                                                                                                                                                                                                                                                                                                                                                                            |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| v1      | Sun 22 Nov | Static Angular site: Home, Experience, Projects (with the Settlement Lab write-up), About, Contact (email, LinkedIn and GitHub links, no form). `/resume.pdf` as a static file (no phone number). All content from `content/` YAML. Dark and light themes, mobile layout, SEO meta and sitemap, basic accessibility. Live on Cloudflare Pages at siddheshfulawade.com. Stretch: visitor counter. |
| v1.1    | ~29 Nov    | Public visitor counter (Pages Function plus D1; unique visitors per day; salted daily hash only, never IPs; atomic increment; shown in monospace). Cloudflare Web Analytics (no cookies). Notes page with 2–3 articles. Security headers via `_headers`. One CI workflow (install, lint, test, build).                                                                                           |
| v2      | ~13 Dec    | Settlement Lab live: Spring Boot API from the `settlement-lab` repo on a free host, plus the Angular dashboard at `/lab`. Host chosen at the start of v2 (Google Cloud Run, Oracle Cloud Always Free, Render or Koyeb) in its own ADR. Contact form as a Pages Function sending mail through a free email API.                                                                                   |
| v2.1    | ~20 Dec    | Engineering page, resume generated from content, Lighthouse in CI.                                                                                                                                                                                                                                                                                                                               |

### Repositories and hosting

- `portfolio` (this repo): the website and its content.
- `settlement-lab` (new public repo): the engine and tests now (spec: `docs/settlement-lab-spec.md`),
  a Spring Boot API in v2. Built in parallel by a separate session; it does not gate v1.
- Hosting: Cloudflare Pages (free plan), built from GitHub. Production builds from `main`; preview
  builds from `develop`. Running cost stays at the domain only. DNS on Cloudflare; the user buys the
  domain and creates the account.

### URL layout (one domain)

- `siddheshfulawade.com`: the Angular site.
- `/projects/settlement-lab`: Lab write-up (v1). `/lab`: live dashboard (v2, same Angular app).
- `/api/visits`: visitor counter Pages Function with D1 (v1.1).
- `api.siddheshfulawade.com`: the Spring Boot API (v2). CORS allows only the site's origin; the CSP
  `connect-src` allows only that host.

### Process

- One spec per release: `specs/NNN-name/spec.md` with requirements, a short design and the tasks,
  approved once (`/spec`).
- Feature-sized tasks (a page, a component, an engine module).
- One branch and one PR per day: `feature/v1-day-N` → `develop`, squash merge after the user's yes.
  `/review` runs once per release, before the release PR to `main`.
- Handoffs at most 20 lines: done, state, next, open questions.
- The agent asks only about merges, pushes, anything outward-facing (deploys, DNS, repos, cloud
  resources), money and real product choices. Everything else it decides and records in the handoff.

### Tests

- Settlement Lab keeps strong tests: unit, jqwik properties, concurrency stress tests, JaCoCo ≥85 %, ArchUnit.
- Website v1: content loader tests and one Playwright smoke test (every route renders, no console
  errors, no serious axe violations). The visitor counter gets tests for hashing and counting. No
  coverage gate for the web in v1.
- Performance and accessibility budgets stay as targets, checked by hand before each release; they
  become CI gates in v2.1.
- The Stop quality gate stays, made fast: typecheck plus Prettier on changed files (about 15 s), instead of
  typecheck plus full `ng lint` (about 57 s). Full lint runs in `/ship`.

### Dependencies

- `npm audit` covers production dependencies only (`--omit=dev`). The picomatch advisory
  GHSA-fc5q-39xc-vjpf affects dev tooling only and is not shipped.
- This ADR approves these **build-time and test-only** web dependencies (nothing ships to the browser):
  `yaml` (parse content), `ajv` (validate content against JSON Schema), `marked` (Markdown to HTML at build
  time), `@playwright/test` (Chromium only) and `@axe-core/playwright` (smoke test). The IBM Plex fonts come from
  `@fontsource` packages (OFL); only their woff2 files ship, as static assets.

### Spec 001

Closed as "done, scope cut by this ADR". T-04, T-14, T-15 and T-16 are dropped. T-09 to T-13 move to the
`settlement-lab` repo in simplified form. T-17 and T-18 are replaced by the v1.1 CI workflow. T-19 is
folded into the fast-track docs change. The root Maven runner (`scripts/mvnw.mjs`) is removed, since the
portfolio has no Java code.

### Dropped

Sveltia CMS, GraalVM native build, PIT mutation tests, jcstress, visual regression, three-browser e2e,
Ctrl+K command palette, OSV runner, Renovate validator, OpenTelemetry and Grafana, a custom analytics
system (replaced by Cloudflare Web Analytics), Azure Container Apps.

## Consequences

- Positive: a recruiter-ready site within 4 days; time is freed for interview prep; the Lab code that interviewers
  read keeps the strongest tests.
- Negative: fewer automated gates on the site until v1.1 (CI) and v2.1 (Lighthouse CI). Mitigation: manual
  Lighthouse and axe checks before each release, plus the smoke test.
- Unchanged: disclosure rules (constitution §6), privacy-safe counting (5.5), domain-only cost (§8), agent safety hooks.

## Related

ADR-0003 (superseded) · `specs/000-constitution.md` · `specs/002-v1-site/spec.md` · `docs/settlement-lab-spec.md`
