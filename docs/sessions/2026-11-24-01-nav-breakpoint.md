# 2026-11-24 · Spec 004 merged as DRAFT, header breakpoint fixed (master session)

**Done**: #38 spec 004 DRAFT (`370e218`). This PR: desktop nav starts at 56rem, not 48rem (the header wrapped to two rows
at 768 to 780 px once Notes is the sixth item; seven items now fit on one row at 896 px with a scrollbar, 12 px spare).
Browser review of #37: axe 0 violations on 13 routes in both themes; only the header wrap failed, which this PR fixes.

**State**: #37 open, unmerged; it needs `develop` merged into it after this PR. `feature/v1-resume` untouched.
**Next**: merge `develop` into #37 and re-check CI; merge #37 after the user's yes. Nothing else is unblocked.

**Waiting on user**

- #37 note content · spec 004 approval and section 6 B · section 6 A to the Lab master.
- Preview builds of `develop` (404) · settings.json copy · domain + www · Email Routing · ghost check · D1 + salt + WAF ·
  Lighthouse on production (no Performance score exists yet) · gitleaks by hand. Steps: `2026-11-23-01-*.md`.
