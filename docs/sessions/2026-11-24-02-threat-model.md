# 2026-11-24 · #39 merged, threat model (master session)

**Done**: #39 header breakpoint (`a56cd6e`). #37 updated with `develop`, green at `a6ebd93`, still unmerged. This PR:
`docs/threat-model.md` (STRIDE; agent tooling left out, reported to the user directly).
e2e can run locally on installed Chrome (a Playwright config with `channel: 'chrome'`): 21 of 21 passed.

**State**: `develop` green; only #37 is open. `feature/v1-resume` untouched.
**Before the counter goes live**: D1 and salt Production only, WAF rule, long salt (V3, V4, V6). Before busy traffic: V5, each
new visitor recounts all of today's rows (needs a small spec 003 change).

**Waiting on user**

- #37 note content · spec 004 approval and 6 B · 6 A to the Lab master · gitleaks by hand.
- `develop` previews (404) · settings.json · domain + www · Email Routing · ghost check · D1 + salt + WAF · Lighthouse.
