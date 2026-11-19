# 000 · Constitution

The rules every spec, agent and session must follow. Changing this file requires an ADR. Last amended by ADR-0004 (2026-11-19).

## 1. Process
1.1 Every change traces to a spec in `specs/NNN-name/`. Bug fixes may use a short spec.
1.2 One spec per release: `specs/NNN-name/spec.md` holds the requirements, a short design and the
    tasks. The user approves it once (ADR-0004).
1.3 Tasks are feature-sized (a page, a component, an engine module). Each task lists its acceptance checks
    and, where the spec asks for tests, the test written first.
1.4 One work branch and one PR per day (`feature/<release>-day-N`), squash-merged to `develop` after the
    user's yes. Each session ends with a short `/handoff` (ADR-0004; supersedes ADR-0003).
1.5 All work lands through pull requests: work branches → `develop` (squash merge) →
    `main` (release PR, merge commit, version tag). `main` is always deployable; `develop` always builds.
    Cloudflare Pages deploys production from `main` and previews from `develop`.
1.6 `/review` runs once per release, before the release PR to `main`; no high or critical finding is open
    when the release merges. The user approves every merge.

## 2. Quality
2.1 Tests first for every behaviour the spec names a test for. Settlement Lab code is always test-first.
2.2 Coverage gates: Settlement Lab ≥85% lines (JaCoCo, in its own repo). No web coverage gate in v1;
    the website relies on content loader tests and a Playwright smoke test (ADR-0004).
2.3 Concurrency code needs property-based or stress tests that check invariants, not only examples.
2.4 Architecture rules are tests (ArchUnit, in the settlement-lab repo): domain code imports no framework
    or adapter code.
2.5 The Stop quality gate stays fast (about 15 s: typecheck plus formatting on changed files) and must pass
    before a session ends. Full lint and tests run before every PR (`/ship`).

## 3. Performance budgets (mobile)
Performance ≥95 · LCP ≤1.8 s · CLS ≤0.05 · INP ≤200 ms · initial JS ≤120 KB gzipped.
Animate only `transform` and `opacity`. Targets checked by hand (Lighthouse) before each release;
CI gates from v2.1.

## 4. Accessibility
WCAG 2.2 AA. Keyboard-complete. Visible focus. `prefers-reduced-motion` honoured everywhere.
Zero serious axe violations. Checked by the smoke test (axe) and by hand before each release;
CI gates from v2.1.

## 5. Security
5.1 Strict CSP, HSTS preload, full security header set. Targets: Observatory A+, securityheaders A+.
5.2 Validate every input; rate-limit every public endpoint; RFC 9457 errors without stack traces.
5.3 No secrets in the repo. Secrets come from the environment or the host's secret store.
5.4 Dependencies: `npm audit` on production dependencies (`--omit=dev`), in CI from v1.1; no high or
    critical CVEs at release. Actions pinned by SHA.
5.5 No personal data stored. Visitor counting uses salted, rotating, irreversible hashes.

## 6. Content and disclosure
6.1 All content lives in `content/` and is validated against JSON Schema in CI.
6.2 Employer work is experience only: resume-level facts, no system diagrams, internal
    names, code, volumes or logos.
6.3 Every metric shown on the site has a `source` field in `content/metrics.yaml`.
6.4 Settlement Lab is original work and must not copy any employer design, naming or code.

## 7. Dependencies and decisions
7.1 New runtime dependencies require an ADR (`/adr`).
7.2 Prefer the platform: native CSS, Web Animations API, View Transitions, JDK features.
7.3 Pin exact versions. Renovate proposes upgrades.

## 8. Cost
Running cost target: domain only (≈ ₹1,000–1,300 per year). Any paid service requires an ADR.
