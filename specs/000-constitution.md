# 000 · Constitution

The rules every spec, agent and session must follow. Changing this file requires an ADR.

## 1. Process
1.1 Every change traces to a spec in `specs/NNN-name/`. Bug fixes may use a short spec.
1.2 Each spec has two human approval gates: after `requirements.md` and after `design.md`.
1.3 `tasks.md` lists small tasks (≤ half a day). Each task names the test written first.
1.4 One task per Claude session. Sessions end with `/handoff`.
1.5 All work lands through pull requests: work branches → `develop` (squash merge) →
    `main` (release PR, merge commit, version tag). `main` is always deployable; `develop` always builds.
1.6 Every PR to `develop` carries the `/review` findings as a PR comment, and no high or critical
    finding is open when it merges. The user approves every merge.

## 2. Quality
2.1 Tests first. A task is not started until its failing test exists.
2.2 Coverage gates: api ≥85% lines (JaCoCo), web ≥80% lines (Vitest), PIT ≥70% on `lab.domain`.
2.3 Concurrency code needs property-based or stress tests that check invariants, not only examples.
2.4 Architecture rules are tests (ArchUnit): domain code imports no framework or adapter code.
2.5 The quality gate hook must pass before a session ends.

## 3. Performance budgets (mobile, Lighthouse CI)
Performance ≥95 · LCP ≤1.8 s · CLS ≤0.05 · INP ≤200 ms · initial JS ≤120 KB gzipped.
Animate only `transform` and `opacity`.

## 4. Accessibility
WCAG 2.2 AA. Keyboard-complete. Visible focus. `prefers-reduced-motion` honoured everywhere.
Zero serious axe violations.

## 5. Security
5.1 Strict CSP, HSTS preload, full security header set. Targets: Observatory A+, securityheaders A+.
5.2 Validate every input; rate-limit every public endpoint; RFC 9457 errors without stack traces.
5.3 No secrets in the repo. Secrets come from environment or Key Vault.
5.4 Dependencies: scanned in CI; no high or critical CVEs at release. Actions pinned by SHA.
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
