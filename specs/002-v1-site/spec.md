# 002 · v1 site · Spec

Release v1, live Sunday 22 Nov 2026 on siddheshfulawade.com (ADR-0004). One spec, approved once.

## 1. Goal

A recruiter can open the site on a phone, see in under a minute who Siddhesh is, what he has built and
how to reach him, and download the resume. Everything is static, prerendered and read from `content/`.

## 2. Requirements (EARS)

### Content

- REQ-CONTENT-001 THE site SHALL read all copy from `content/` (YAML and Markdown); components hold no copy.
- REQ-CONTENT-002 WHEN the site builds, THE content build SHALL validate every file against its JSON
  Schema in `content/_schema/`, and IF any file is invalid, THEN the build SHALL fail with the file and field.
- REQ-CONTENT-003 Items with `published: false` SHALL appear nowhere (pages, links, sitemap).
- REQ-CONTENT-004 Lists SHALL sort by `order`, then by date, newest first.
- REQ-CONTENT-005 No employer volume or throughput number SHALL appear; employer work is described by
  its guarantees. Every number in `metrics.yaml` SHALL have a `source`. Numbers use international format.

### Pages

- REQ-PAGE-001 THE site SHALL have these prerendered routes: `/`, `/experience`, `/projects`,
  `/projects/:slug` (one per published project), `/about`, `/contact`, and a 404 page.
- REQ-PAGE-002 Home SHALL show name, headline, a short summary, sourced metrics, featured projects and
  links to the resume and the contact page.
- REQ-PAGE-003 Experience SHALL list roles newest first: company, title, dates, location and impact bullets.
- REQ-PAGE-004 Projects SHALL list published projects; each detail page renders its Markdown write-up.
- REQ-PAGE-005 `/projects/settlement-lab` SHALL present the problem, design, decisions and trade-offs,
  a results section (real numbers from the settlement-lab repo, or "results coming") and a repo link.
- REQ-PAGE-006 About SHALL show the longer bio, skills grouped with evidence links, and education.
- REQ-PAGE-007 Contact SHALL show hello@siddheshfulawade.com (mailto), LinkedIn and GitHub links, and no form.
- REQ-PAGE-008 `/resume.pdf` SHALL be served as a static file and linked from Home, About and Contact.

### Shell, themes, accessibility

- REQ-UI-001 Every page SHALL have a header with navigation, a skip link to main content and a footer.
- REQ-UI-002 THE site SHALL default to the system colour scheme, and WHEN the user picks a theme, THE site
  SHALL remember it and apply it before first paint on the next visit.
- REQ-UI-003 Layouts SHALL work from 320 px wide with no horizontal scroll; navigation collapses on mobile.
- REQ-UI-004 WHILE `prefers-reduced-motion: reduce` is set, THE site SHALL not animate.
- REQ-UI-005 Keyboard users SHALL reach everything, with visible focus; focus moves to the main heading on
  route change. No serious axe violations on any route.

### SEO

- REQ-SEO-001 Each route SHALL set its `<title>`, meta description, canonical URL and Open Graph tags from content.
- REQ-SEO-002 THE build SHALL emit `sitemap.xml` (published routes only) and `robots.txt`.

### Deploy

- REQ-DEP-001 Cloudflare Pages SHALL build `develop` as a preview and `main` as production on
  siddheshfulawade.com, over HTTPS.

Non-functional: initial JS ≤120 KB gzipped, LCP ≤1.8 s and CLS ≤0.05 on mobile (checked by hand before release).

## 3. Design (short)

- **Content build** (`apps/web/scripts/build-content.mjs`, runs before `dev`, `build` and `test`): reads
  `content/` with `yaml`, validates with `ajv` against `content/_schema/*.json`, renders Markdown to HTML with
  `marked`, drops unpublished items, sorts, and writes `apps/web/src/generated/content.json` (gitignored).
  It also writes `public/sitemap.xml` and `public/robots.txt` from the route list.
- **ContentService** (`core/content/`): typed, signal-based read access to the generated JSON. The only
  way components get copy. Markdown HTML goes through Angular's built-in sanitizer (`[innerHTML]`), never `bypassSecurityTrust*`.
- **Content files**: `site.yaml` (nav, page titles and descriptions, footer), `profile.yaml` (name, headline,
  summary, bio, email, public links; no phone, no availability line), `metrics.yaml`,
  `experience/YYYY-MM-company.yaml`, `projects/<slug>.md`, `skills.yaml`, `education.yaml`.
- **Styles**: `src/styles/tokens.css` (design-system tokens for both themes via `[data-theme]` and
  `prefers-color-scheme`), `base.css`, IBM Plex self-hosted (latin woff2 from `@fontsource`). Theme choice is
  kept in `localStorage` and applied by a small external `public/theme-init.js` loaded in `<head>` (no inline script, CSP-safe).
- **Routes**: lazy feature components under `features/`; `getPrerenderParams` lists project slugs from content.
  `SeoService` sets title, meta, canonical and OG per route from `site.yaml` and the item.
- **Smoke test**: Playwright (Chromium only) against the built static output: each route returns 200,
  has an `h1`, logs no console errors and has no serious axe violations.
- **Hosting**: Cloudflare Pages, root `apps/web`, build `npm ci && npm run build`, output
  `dist/web/browser`. A `404.html` is served for unknown paths.

## 4. Tasks

Branch per day: `feature/v1-day-N` from `develop`, one PR per day.

### Thu 19 Nov (day 1): content and tokens

- [ ] V1-01 [content] Content YAML and JSON Schemas: `site`, `profile`, `metrics`, `experience`, `projects`
      (Settlement Lab write-up stub), `skills`, `education`; copy drafted from the resume for the user's approval.
      Checks: every file validates; no phone, personal email, employer volume or throughput figure; every metric has `source`.
- [ ] V1-02 [web] Content build and `ContentService`. Tests first: valid content builds; an invalid field fails the
      build naming file and field; unpublished items are dropped; sort order; Markdown renders to HTML.
      Checks: `npm run build` produces `content.json`; the home placeholder reads its text from content.
- [ ] V1-03 [web] Design tokens, base styles, fonts, light and dark themes with the toggle logic and reduced motion.
      Checks: both themes meet contrast (body ≥4.5:1); no literal colours in components; no theme flash on reload.

### Fri 20 Nov (day 2): layout, Home, Experience

- [ ] V1-04 [web] App shell: header and mobile nav, theme toggle, skip link, footer, 404, focus on route change.
      Checks: keyboard-only pass; 320 px with no horizontal scroll.
- [ ] V1-05 [web] Home page (REQ-PAGE-002). Checks: all copy from content; metrics show their source on hover or focus.
- [ ] V1-06 [web] Experience page (REQ-PAGE-003). Checks: newest first; dates in one format.

### Sat 21 Nov (day 3): Projects, About, Contact, first deploy

- [ ] V1-07 [web] Projects list and detail template, prerendered per slug (REQ-PAGE-004).
- [ ] V1-08 [web] About and Contact pages and resume links (REQ-PAGE-006, 007, 008). Needs the user's
      `apps/web/public/resume.pdf`.
- [ ] V1-09 [web] Playwright smoke test (replaces and deletes `scripts/e2e-stub.mjs`); first Cloudflare Pages
      preview deploy from `develop` (**the user connects the repo in the Cloudflare dashboard**).
      Checks: smoke test green locally; the preview URL serves every route.

### Sun 22 Nov (day 4): write-up, SEO, polish, launch

- [ ] V1-10 [content] Settlement Lab write-up at `/projects/settlement-lab` (REQ-PAGE-005), from
      `docs/settlement-lab-spec.md` and, if ready, `results/results.md` from the settlement-lab repo.
- [ ] V1-11 [web] SEO: per-route meta from content (retires the Q-1 placeholder `<title>`), OG image,
      canonical, `sitemap.xml`, `robots.txt` (REQ-SEO-001, 002).
- [ ] V1-12 [web] Mobile and accessibility pass at 320, 375 and 768 px in both themes, manual Lighthouse run.
      Checks: Lighthouse mobile ≥95 performance and 100 accessibility on Home, or the gaps written down.
- [ ] V1-13 [infra] Release v1.0.0: `/review`, `/release`, merge to `main`, connect siddheshfulawade.com in
      Cloudflare Pages (**user actions: domain, DNS, Email Routing**). Checks: HTTPS on the apex domain, `www` redirects.
- [ ] V1-14 [web] **Stretch:** visitor counter (Pages Function plus D1; hash and count tests first). Otherwise it moves to v1.1.

## 5. Out of scope (v1)

Contact form, Notes, visitor counter (stretch only), security headers file, CI workflow (all v1.1);
the `/lab` dashboard (v2); the Engineering page and generated resume (v2.1).

Status: APPROVED (2026-11-19, user approved the fast-track plan)
