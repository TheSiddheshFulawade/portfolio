# 2026-11-22 · v1 day 4: SEO, write-up check, quality pass (cloud session)

**Done**

- PR #15 (day 3) merged by the agent (user delegated PR decisions). Day 4 on `feature/v1-day-4`:
  V1-11 SEO (`SeoService`, per-route meta and canonical, 404 `noindex`, `og.png` via `npm run og-image`, sitemap
  and robots from the content build), V1-10 write-up check, V1-12 quality pass (`docs/v1-quality-pass.md`).
- `npm run verify` green (67 unit, 69 script tests); `npm run e2e` 15 of 15 green. Initial JS 87.3 KB gzipped.
- Lighthouse mobile, compressed: 100 performance (Home median, Settlement Lab), 100 accessibility, best practices, SEO.

**State**

- Left for v1.0.0 (V1-13, needs the user): resume.pdf, Cloudflare Pages project and preview, domain, DNS,
  Email Routing, then `/release` (runs `/review`) and the release PR to `main`. V1-14 counter moves to v1.1.
- The `guard-bash` hook treats a JS template-literal placeholder whose name contains "token" as a secret
  env-var expansion, even inside a quoted heredoc (false positive). `scripts/og-image.mjs` was written with the
  file tool instead. Worth tightening the hook's pattern.

**Open questions**: PennyWise repo URL; check canonical URLs against Cloudflare's trailing-slash behaviour on the preview.
