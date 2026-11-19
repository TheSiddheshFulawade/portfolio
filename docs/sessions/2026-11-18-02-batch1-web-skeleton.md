# 2026-11-18 · Spec 001 T-02, agent safety, batch 1 (web skeleton)

**Goal of this session:** ship T-02, harden agent safety, switch to batched delivery, and land batch 1.

## Done

- Merged: #7 handoff, #8 spec security revision (mvnw allow-list, gate skip rule, locked Renovate),
  #9 agent safety policy (settings and hooks), #10 T-02 (root scripts, check runner, mvnw runner).
- ADR-0003 batched delivery: 4–5 tasks per review checkpoint, one PR per batch. Constitution 1.4 and
  CLAUDE.md are updated. Local `git commit` no longer prompts; push still asks.
- Batch 1 on `feature/001-batch-1`, PR #11 open (review comment posted, no high findings):
  T-03 (Node 24.22.3 pin, line endings), T-05..T-08 (Angular 22 static zoneless app, lint, 80 %
  coverage gate, prerendered placeholder home). Review fixes: lockfile registry/integrity rule,
  `inlineCritical: false`, guard blocks commits on main/develop and asks before `--amend`.
- User decisions: keep the original plan and scope (the slimmed roadmap was dropped); batch reviews.

## State

- Branch `feature/001-batch-1` at the handoff commit, pushed; PR #11 waits for the user's merge.
- Green: lint, format, typecheck, test:web (100 % lines), build:web, test:scripts 88/88,
  check:repo 4/4, hook pipe-test 91/91. **Red: `audit:web`** (picomatch, see open questions).
- Nothing uncommitted. `develop` is at 546aeae.

## Next

1. The user answers the open questions, then merge #11 (squash, delete branch).
2. Batch 2 = API track: T-09..T-13 (Maven wrapper, Boot 4 pom, health-only actuator, JaCoCo 85 %,
   Spotless, ArchUnit) on `feature/001-batch-2`. Java 25.0.1 is installed; JAVA_HOME is unset (mvnw uses PATH).
3. Then T-04, T-14..T-19 (hook tests, OSV, Renovate, CI), then spec 002 (design system).

## Open questions

1. picomatch GHSA-fc5q-39xc-vjpf (high, no fix, dev tooling only, not shipped): (a) 30-day exception
   via audit wrapper and exceptions file (recommended), (b) wait, (c) audit prod deps only.
2. Merge PR #11?
3. Local Node is 24.18.0; `.nvmrc` pins 24.22.3 (security release). The upgrade is the user's action.

## Gotchas

- The format hook now runs Prettier (apps/web) on root `.mjs` files edited with Edit/Write, which
  reformats whole files. For hook or security files, patch with a script to keep diffs small.
- Bash on Windows collapses `\\` in heredocs: write Node scripts to a file first.
- `String.replace` treats `$'` in replacement text as a pattern: use a replacer function.
- Settings files are write-protected for file tools; edits go through a shell command that prompts the user.
- The quality gate can fail mid-`npm install` (missing rxjs); re-run after the install finishes.
