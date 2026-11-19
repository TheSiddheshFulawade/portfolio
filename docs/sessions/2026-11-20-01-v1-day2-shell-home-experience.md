# 2026-11-20 · v1 day 2: shell, Home, Experience (cloud session)

**Done**

- V1-04 app shell (skip link, header, mobile menu, theme toggle, footer, focus on route change, `/404` copied to `404.html`), V1-05 Home (sourced metric tooltips, featured work), V1-06 Experience. One commit per task on `feature/v1-day-2`.
- `npm run verify` green; 36 unit tests, 66 script tests; initial JS 82.7 KB gzipped (was 67: the shell now pulls `content.json` into the main bundle).
- Browser check with the preinstalled Chromium (ad hoc, not committed): `/`, `/experience`, 404 at 320/375/768/1280 px in both themes; no horizontal scroll, one `h1`, no console errors, no serious axe violations; keyboard pass at 320 px.

**State**

- `feature/v1-day-2` pushed and a PR opened to `develop` (first push got 403 until the user installed the Claude GitHub App). Not merged: waiting for the user's yes.
- Links to `/projects`, `/projects/settlement-lab`, `/contact` and `/resume.pdf` show the 404 page until V1-07 and V1-08.

**Next**

Saturday: V1-07 Projects, V1-08 About and Contact (needs `apps/web/public/resume.pdf`), V1-09 smoke test and the first Cloudflare preview.

**Open questions** (also in the PR description)

1. New UI labels in `site.yaml` (`Track record`, `Featured work`, `Get in touch`, ...): wording OK?
2. Event replay (`withEventReplay`) is off, so a tap on Menu before hydration is lost; turning it on adds an inline script (CSP). Keep off?
