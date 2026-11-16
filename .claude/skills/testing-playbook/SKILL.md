---
name: testing-playbook
description: How tests are written in this repo - pyramid, naming, gates, and patterns for concurrency, SSE, e2e, accessibility and performance tests. Load before writing or reviewing tests.
---
# Testing playbook

## Gates (CI fails below these)
api ≥85% lines (JaCoCo) · web ≥80% lines (Vitest) · PIT ≥70% on lab.domain ·
zero serious axe violations · Lighthouse budgets (constitution §3).

## Naming
`REQ-<AREA>-NNN <behaviour in plain words>`, e.g. `REQ-LAB-003 duplicate delivery posts once`.
One behaviour per test; arrange / act / assert separated by blank lines.

## Pyramid
1. Domain unit tests (fast, no Spring): most tests live here.
2. Property tests (jqwik) for invariants over random inputs.
3. Slice tests (`@WebMvcTest`): validation, problem details, rate limits.
4. A few `@SpringBootTest` integration tests with WireMock for external services.
5. Web: component tests with Testing Library; Playwright e2e for journeys; visual snapshots.

## Concurrency patterns
- Property: for N random transfers run by K threads, the sum of balances is unchanged,
  no posting id appears twice and no balance goes below zero.
- Stress: start threads behind a `CountDownLatch`, release together, join with a timeout, assert invariants.
- Deadlock check: run opposing transfers (A→B and B→A) concurrently under a timeout.
- Awaitility for async completion; never `Thread.sleep` for synchronisation.
- jcstress for the smallest ledger primitive if lock-free code is introduced.

## SSE
Assert event order and shape with a test subscriber; assert the stream completes and resources close.

## E2E
Playwright projects: chromium, webkit, firefox, mobile-chromium. Every page test runs axe.
Visual snapshots in both themes at 375 and 1440 px, with reduced motion emulated.

## Performance
JMH for engine micro-benchmarks (results become a Note); k6 for API load on staging;
Lighthouse CI for pages.
