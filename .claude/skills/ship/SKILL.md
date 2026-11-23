---
name: ship
description: Ship the current work branch to develop through the git-ops agent - verify, push, PR, wait for the required check, squash-merge on green (ADR-0005).
disable-model-invocation: true
argument-hint: "[optional PR title]"
---

Ship the current branch to `develop`. Title override: $ARGUMENTS

1. **Check the branch.** It must be `feature/*`, `fix/*`, `chore/*` or `docs/*`, never `main` or `develop`.
   Commit any task work first (local commits need no prompt). Never ship `feature/v1-resume`.
2. **Gate.** Run `npm run verify` at the root (repo checks, hook tests, lint, typecheck, tests, functions, build,
   prod audit). Fix failures before continuing. Record the SHA it passed on (`git rev-parse HEAD`).
3. **Delegate to `git-ops`** with: the task id (for example `002 V1-08`), a two-line summary (what and why,
   REQ ids, tests added, risks) and the verified SHA. git-ops does the leak check, push, PR to `develop`,
   waits for the required check "verify and smoke test", squash-merges on green and cleans up.
   No user yes is needed (ADR-0005): GitHub branch protection refuses a merge on red.
4. **Red CI.** git-ops reports the failing log and does not edit code. Fix the cause on the same branch,
   re-run `npm run verify`, then hand back to git-ops with the new SHA.
5. **After merge.** Tick the task in `spec.md` if not done, add the CHANGELOG line, and update the day's
   handoff (`/handoff`, at most 20 lines) with the PR link and merge SHA.

No per-PR review (ADR-0004): `/review` runs once per release, inside `/release`.
Hard gates (CLAUDE.md "When to ask the user") still stop the task; record them under "Waiting on user".
