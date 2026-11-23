# 2026-11-23 · Notes PR open, spec 004 drafted (master session)

**Done**: #36 parked handoff merged (`f74999b`). V11-07: #37 open and green at `333097d`, **not merged**. Spec 004 (`/lab`)
written as DRAFT in this PR. Lab `docs/api-contract.md` is on settlement-lab `main` (approved 2026-11-23).
**Gaps found in earlier work**: v1.0.0 and v1.0.1 shipped without a Lighthouse Performance score (`/release` asks for ≥95);
v1.0.1 axe covered 4 routes, dark theme only; `develop.portfolio-7qt.pages.dev` answers 404 (no preview deployments), so
both gates ran on local builds. Squash back-merges made #34 conflict with `main`; expect the same next release.

**State**: `develop` green; `feature/003-v11-07-publish-notes` kept for #37; `feature/v1-resume` local only, untouched.
**Next**: browser check of #37 (six nav items), then merge #37 after the user's yes. No 004 code before approval.

**Waiting on user**

- #37: approve both notes; commit 3 (four factual corrections) can be dropped separately.
- Spec 004: approve, and answer section 6 B. Section 6 A goes to the Lab master (question 2 matters most: no live chart
  unless runs are paced).
- Cloudflare: why `develop` has no preview deployment (Pages project → Settings → Builds → Preview branches).
- From `2026-11-23-01-*.md`: settings.json copy, domain + www, Email Routing, ghost check, D1 + salt + WAF, Lighthouse.
- gitleaks: agents cannot run it (permission classifier); run it once by hand.
