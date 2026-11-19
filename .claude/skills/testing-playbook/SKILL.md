---
name: testing-playbook
description: How tests are written in this repo and in settlement-lab - what is tested, naming, gates, and patterns for content, smoke e2e, accessibility and concurrency tests. Load before writing or reviewing tests.
---

# Testing playbook (ADR-0004)

## What is tested

- **Website v1**: content build and `ContentService` (unit, Vitest), and one Playwright smoke test over
  every route. No coverage gate in v1. Add a unit test when a component has real logic (theme, SEO).
- **Visitor counter (v1.1)**: hashing (salt and daily rotation, no raw IP kept) and counting
  (atomic, one per visitor per day).
- **Settlement Lab** (its own repo): unit, jqwik properties, concurrency stress tests, JaCoCo ≥85 %, ArchUnit.
- Performance and accessibility budgets: checked by hand before each release; CI gates from v2.1.

## Naming

`REQ-<AREA>-NNN <behaviour in plain words>`, e.g. `REQ-CONTENT-002 invalid field fails the build`.
One behaviour per test; arrange / act / assert separated by blank lines.

## Smoke test (Playwright, Chromium only)

Run against the built static output. For every route: status 200, one `h1`, no console errors, and no
serious or critical axe violations (`@axe-core/playwright`). Add new routes to the list as pages ship.

## Concurrency patterns (settlement-lab)

- Property: for N random transfers run by K threads, the sum of balances is unchanged,
  no transfer id is posted twice and no balance goes below zero.
- Stress: start threads behind a `CountDownLatch`, release together, join with a timeout, assert invariants.
- Deadlock check: run opposing transfers (A→B and B→A) concurrently under a timeout.
- Awaitility for async completion; never `Thread.sleep` for synchronisation.
