# v1.0.0 release review (spec 002, `/review` step of `/release`)

Diff `origin/main...origin/develop` at `7c1a164` (179 files). Run in the cloud session on 2026-11-19, before
the Cloudflare preview exists. Security part done by hand against the security-baseline checklist; UI and
performance from the V1-12 pass (`docs/v1-quality-pass.md`). Re-check items marked "preview" on the preview URL.

## Result: no must-fix findings

| #   | Area           | Finding                                                                                                                                                                                                                                                                                           | Severity  | Action                                                                                                                                                                |
| --- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | CSP readiness  | Every page ships two inline executable scripts: Angular's hydration event-replay contract (`ng-event-dispatch-contract`) and its bootstrap call. Event replay is on by default with `provideClientHydration()`. The day-2 PR wrongly said it was off; taps before hydration are in fact replayed. | follow-up | v1 sends no CSP, so nothing breaks. For the v1.1 `_headers` task, enable Angular `autoCsp` (hashes inline scripts) or turn event replay off, and test on the preview. |
| 2   | Headers        | No security headers yet (`_headers` is v1.1 by spec).                                                                                                                                                                                                                                             | follow-up | v1.1 task, as planned in ADR-0004.                                                                                                                                    |
| 3   | Canonical URLs | Canonical URLs and the sitemap have no trailing slash. If Cloudflare Pages redirects `/experience` to `/experience/`, every canonical points at a redirect.                                                                                                                                       | preview   | Check on the first preview; switch both to the trailing slash if Pages redirects.                                                                                     |
| 4   | Resume         | `/resume.pdf` is linked from Home, About and Contact but the file is not in the repo; the links show the 404 page.                                                                                                                                                                                | release   | The user adds `apps/web/public/resume.pdf` (no phone number) before the release PR is merged.                                                                         |

## Checked and clean

- Supply chain: `npm audit --omit=dev` 0 vulnerabilities. New dependencies are test-only and approved in ADR-0004
  (`yaml`, `ajv`, `marked`, `@playwright/test`, `@axe-core/playwright`, `@fontsource/*`), all pinned exactly.
- Rendered HTML: `[innerHTML]` is used once, for the build-time Markdown write-up, through Angular's sanitizer;
  no `bypassSecurityTrust*`. No `target="_blank"`. External links use `rel="noopener"` (`rel="me"` on profiles).
- Privacy and disclosure (built output): the only email is hello@siddheshfulawade.com; no phone numbers; no
  employer names outside `/experience`; no employer volume or throughput figures (also enforced by the content build).
- Test-only code is not shipped: `e2e/serve.mjs` and `scripts/` are outside `dist/`. `e2e/serve.mjs` refuses
  paths outside the build folder.
- Agent safety: the `guard-bash` change (PR #17) keeps every rule and adds tests; `docs/private/` is not tracked.
- Traceability: each page and behaviour maps to a REQ id in spec 002, and every test the spec names exists
  (content loader tests, Playwright smoke test).
- UI and performance: see `docs/v1-quality-pass.md` (accessibility, best practices and SEO 100; performance
  100 on Home with compression; LCP about 1.0 s; CLS 0; initial JS 87.3 KB gzipped).
