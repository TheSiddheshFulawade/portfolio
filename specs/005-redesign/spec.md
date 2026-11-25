# 005 · Redesign · Spec

Release v1.2.0, target Sun 29 Nov 2026, before spec 004. Design approved by the user on 2026-11-24: blueprint
`.cache/design/portfolio-concept-v2.html` (local, git-ignored; source `.cache/design/v2/`). Port its structure, wording
direction, spacing and behaviour. Where it and this spec differ, this spec wins.

## 1. Goal

A hiring manager at a global bank sees, within a minute, a senior engineer's site: who he is, what he has built, and two
systems they can break and watch recover. A specialist who looks closely finds nothing technically or financially wrong.

## 2. Requirements (EARS)

### Accuracy

- REQ-ACC-001 THE site SHALL publish a technical or financial claim only with a row in `docs/accuracy/claims.md` that names its source.
- REQ-ACC-002 IF `technical-auditor` or `finance-auditor` has an open wrong, misleading or unsupported finding on a change, THEN
  the change SHALL NOT merge.
- REQ-ACC-003 EACH simulation SHALL be a pure, seeded TypeScript model with no DOM or timers, and a view that only draws it.
- REQ-ACC-004 EACH simulation SHALL be labelled as a simplified model; measured results SHALL stand apart, and state what
  was measured, machine, JDK, run count, run date, workload and source.
- REQ-ACC-005 WHILE a project is in development, its copy SHALL separate what is designed from what merged tests prove.

### Shell and pages

- REQ-UI-101 Separate pages SHALL stay: Home, Projects, Experience, Notes (while one is published), About, Contact. No single-page rework.
- REQ-UI-102 THE footer SHALL show identity, site links, systems, profiles, email, location, copyright, build note, source link and
  the visitor counter slot, on every page.
- REQ-UI-103 Content sections SHALL use a label rail (sticky from 60rem) and a detail column, with thin rules between sections.
- REQ-UI-104 THE 404 page SHALL show the dot field as "404", a plain message and a way home.
- REQ-UI-105 WHERE `profile.photo` is set, Home and About SHALL show it as a 4:5 image with alt text, width, height and a
  size under 60 KB; otherwise the layout SHALL close up. A placeholder SHALL never ship.

### Home

- REQ-HOME-101 THE headline SHALL be complete in the prerendered HTML; its last phrase MAY cycle once through `hero.phrases`,
  ending within 5 s on the prerendered phrase. Screen readers get one fixed sentence.
- REQ-HOME-102 THE technology strip SHALL move only with the scroll and wrap into rows with reduced motion or no support.
- REQ-HOME-103 THE invariant field SHALL draw Σ = 0 with one dot per entry (a debit or a credit; two dots are one transaction) and
  offer: drop a node, partition, deliver twice. The two entries of a transaction move together, and whole transactions are
  delivered twice. A committed entry is never shown as uncommitted. Counters come from the model, never from pixels:
  committed, reachable, unreachable, recovering (only while a node's log is replayed), duplicate transactions not applied,
  debits − credits. committed = reachable + unreachable + recovering. Pointer movement changes no counter.
- REQ-HOME-104 Home SHALL then show selected systems, an experience summary without employer names, engineering decisions,
  capabilities with evidence, and contact.
- REQ-HOME-105 EACH engineering decision SHALL state the choice, the rejected option, the reason, the cost and its evidence.

### Experience and About

- REQ-EXP-101 Experience SHALL show every role in full, highlights grouped by theme, with dates, place, mode and stack in the
  rail, and recognition; then education, certification and achievements. Wording stays resume-level (constitution 6.2).
- REQ-ABOUT-101 About SHALL show the photo, bio and capabilities with evidence. A skill without evidence SHALL be hidden.

### Projects and simulations

- REQ-PROJ-101 `/projects` SHALL show PayFlow and Settlement Lab in full with their simulations, then earlier work. Detail pages stay.
- REQ-PROJ-102 THE PayFlow model SHALL follow payflow `SPEC.md` §4, and the merged code where a step is merged at a recorded commit,
  and label each scenario "merged, tested per service", "partly merged" or "specified, not built yet". Six scenarios: completes, wallet crash,
  duplicate delivery, risk rejection, broker outage, insufficient funds. It shows payment state, event log, outbox and
  inbox counts, balances and Σ(available + held). Inbox row, effect and
  outgoing message change in one step. `REVERSED` is explained as an authorisation reversal: any hold was released, nothing
  was captured.
- REQ-PROJ-103 THE Settlement Lab model SHALL run 600 transfers through a bounded queue, 8 workers, a ledger (ordered locking, CAS, and two
  modes marked unsafe and browser-only), then publish each posting directly, with retry inside a circuit breaker, to a simulated
  general ledger keyed by transfer id; only a failed publish enters the outbox. Duplicate ids are answered before the queue. Retry and
  circuit-breaker limits and the six invariants are those of the repo; transfers, accounts, queue size and wait times are scaled
  down, and the page says so. A deadlocked run shows "not evaluated"; an unordered
  run that finishes says "No deadlock this time; the risk remains."
- REQ-PROJ-104 Measured results SHALL come from `content/`, generated from settlement-lab `results/results.json` at a recorded commit,
  with the facts of REQ-ACC-004. Rates are named for what they measure: submissions answered by the engine (duplicates and
  rejections included), not delivery to the general ledger.
- REQ-PROJ-105 EACH simulation SHALL start only on a click, end by itself, offer Run and (PayFlow) Pause, and log its steps as text.

### Motion, accessibility, security, performance

- REQ-MOT-101 Nothing SHALL move by itself for more than 5 s. There is no site-wide motion button.
- REQ-MOT-102 WHILE `prefers-reduced-motion: reduce`, every animation SHALL show its final state at once, with the same text and numbers.
- REQ-MOT-103 Loops SHALL stop when off screen, hidden or settled. Route changes MAY use view transitions.
- REQ-A11Y-101 WCAG 2.2 AA; every simulation is usable by keyboard, with a text log or polite status, and never relies on colour alone.
- REQ-SEC-101 No CSP weakening: no `style` attributes in templates, no new hosts. `_headers` line ≤1,900 characters, so spec 004 still fits.
- REQ-PERF-101 Initial JS ≤105 KB gzipped (spec 004 adds ≤1 KB; constitution limit 120). Simulations live in lazy route chunks (≤25 KB gzipped each).
  LCP ≤1.8 s, CLS ≤0.05, INP ≤200 ms. No new runtime dependency.

## 3. Design (short)

- **Content**: `site.yaml` (hero phrases, section labels, footer), `decisions.yaml`, `skills.yaml` regrouped into four capability groups,
  experience `highlights` grouped by `theme`, `projects/payflow.md`, `results/settlement-lab.yaml`, optional `profile.photo`; a schema
  and a content test for each. Disclosure rules apply to all of it.
- **Models**: `shared/sim/` holds `rng.ts`, `ledger-field.model.ts`, `saga.model.ts`, `settlement.model.ts`. Each exposes `step()`, a readonly
  snapshot and an event list. The blueprint's `LabSim`, PayFlow scenarios and field logic are the starting point.
- **Views**: canvas field, saga diagram (HTML nodes, SVG edges), settlement board. Frames are time-based and pause-aware; colours are read
  from tokens and re-read on theme change; dynamic values are set through CSSOM or SVG attributes.
- **Styles**: at most 8 new stylesheets. Shared rail, rows, chips and button styles go in the global sheet.
- **Auditors**: `technical-auditor` and `finance-auditor` review each task that touches their area and the whole site at the end.
  Open findings live in `.cache/accuracy/open.md`; the repo holds sourced claims only.

## 4. Tasks

One branch and PR per task (ADR-0005). RD-03 and RD-04 can run in parallel; so can RD-05, RD-06 and the models of RD-07 and RD-08.

- [x] RD-01 [docs] Spec, agents, `accuracy-baseline`, review and release wiring (this branch). Both auditors review the blueprint and the claim
      register; their corrections go into the register and `.cache/accuracy/open.md`. Checks: `npm run verify`; register rows verified or removed.
- [x] RD-02 [design] `design-system` skill updated to the blueprint (rail layout, type sizes, motion rules; remove eyebrows, count-up, magnetic
      buttons, dot grid, card glow); shared styles and the view-transition set-up (REQ-UI-103, REQ-MOT-101 to 103). Checks: contrast tests.
- [x] RD-03 [content] Content model above, with schemas and tests first (missing decision cost fails; skill without evidence hidden; any employer
      or institute from the work history outside Experience fails; results need every fact of REQ-ACC-004) (REQ-HOME-104, 105, REQ-EXP-101, REQ-PROJ-104). Finance and technical audit.
- [x] RD-04 [web] Header, footer, contact section, 404 (REQ-UI-101, 102, 104). Smoke test extended.
- [ ] RD-05 [web] Home (REQ-HOME-101 to 105, REQ-UI-105). Tests first: field model (pairs move together; net zero for all and for
      reachable entries in every state; counters sum to committed; the near side of a partition stays reachable; redelivered ids are
      whole pairs and change no balance; displacement and pointer change no counter; returns to rest); headline ends within 5 s; reduced motion.
- [ ] RD-06 [web] Experience and About (REQ-EXP-101, REQ-ABOUT-101). Tests: every highlight in content is rendered once.
- [ ] RD-07 [web] Settlement Lab model, view and results table (REQ-PROJ-101, 103 to 105). Tests first, 30 seeds per combination: safe modes pass all
      six invariants; unordered locking deadlocks on these seeds and a finishing run says so; without synchronisation the exact failing
      set is asserted per seed (POSTINGS_EXPLAIN_BALANCES always, TOTAL_CONSERVED on these seeds); the six checks equal
      `InvariantChecker` and take accepted ids from callers' outcomes; 3 attempts; never open → closed directly; duplicates use no queue
      slot; every seed rejects some transfers; one playback rate for all modes; outbox drains.
- [ ] RD-08 [web] PayFlow model and view (REQ-PROJ-102, 105). Tests first: each scenario's terminal state, one terminal state only, Σ constant after every
      step, no effect before its commit, re-send has a new id, redelivery has the same id, late attempt ignored; inbox,
      effect and outgoing message in one step; RECEIVED never alone; outbox falls only after the ack; a redelivered command
      adds an outbox row with the stored reply's message id and no inbox row; a redelivered reply adds neither; each COMPLETED has exactly
      one capture (one payer debit, one payee credit); REVERSED and REJECTED move no money between wallets; no negative balance, held = 0 at a terminal state. Repin payflow first.
- [ ] RD-09 [review] Both auditors on every page and simulation (PASS), `ui-reviewer`, `security-auditor`, `perf-auditor`; claim register complete.
- [ ] RD-10 [release] `/release` v1.2.0. Needs the production domain live and the photo, or the user's yes to launch without it.

## 5. Out of scope

Single-page layout, `/lab` and the API (spec 004), contact form, resume PDF, animation libraries, sound, 3D.

## 6. Open questions for the user

1. The photo file (about 1200 × 1500 px). [Until then the layout closes up.]
2. Product names and one ranking in the work history (`.cache/accuracy/open.md`, O-01 to O-04, O-07). [Use neutral wording or drop the item.]
   Decided 2026-11-24: ReBIT wording follows the resume ("thread-safe", 85% without scope) and RBI's public terms for e-Kuber 3.0.
3. Should PayFlow appear before its v1.0.0? [Yes, marked "In development".]

Status: APPROVED (user, 2026-11-24, with the default answers in section 6; REQ-ACC-004, HOME-103, PROJ-102 to 104 and the test lists
corrected after the RD-01 audit, approved by the user the same day)
