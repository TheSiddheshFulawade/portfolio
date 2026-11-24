---
name: review
description: Review a release (or a branch on request) with security, UI and performance auditors in parallel and merge their findings. Runs once per release from /release (ADR-0004).
disable-model-invocation: true
argument-hint: "[optional paths or routes]"
---
Review the current branch against BASE (below). Scope: $ARGUMENTS

Pick the base (BASE), first match wins:
- an open PR exists for this branch: its target, from
  `gh pr list --head "$(git branch --show-current)" --state open --json baseRefName,headRepositoryOwner`
  (if more than one open PR matches, or its head repository owner is not origin's owner, stop and ask);
- the branch is `release/*` or `develop` itself: `main`;
- otherwise: `develop`.
BASE must be exactly `develop` or `main`. For any other value (for example, a PR retargeted to
another branch), stop and ask the user; never put it in a command. A base that already holds the
changes would hide them from the diff.
Always diff against the remote ref `origin/BASE`, so a stale local branch in a worktree cannot widen the diff.

1. Get the diff: `git fetch origin "refs/heads/BASE:refs/remotes/origin/BASE"`, then
   `git diff "origin/BASE...HEAD" --stat` and the full diff of changed files. Record BASE and the reviewed
   commit (`git rev-parse HEAD`) for `/ship`.
   - If `git status --porcelain` is not empty, warn that uncommitted work is not reviewed and ask
     whether to commit it first.
   - If the diff is empty, stop and say "nothing to review against origin/BASE". Never report an
     empty diff as a clean review.
2. In parallel, delegate to (pass BASE on):
   - `security-auditor` always;
   - `ui-reviewer` when files under apps/web or content changed (start the dev server first if needed);
   - `perf-auditor` when files under apps/web changed;
   - `technical-auditor` when a simulation, animation, diagram, number or technical copy changed;
   - `finance-auditor` when anything that mentions money, payments, ledgers or banking changed.
     For a release, both always run on every page. A FAIL from either is must-fix.
3. Check traceability yourself: each changed behaviour maps to a REQ id; where the spec names a test, it exists.
4. Merge the findings into one list ordered by severity, removing duplicates. Mark each as
   must-fix (blocks the PR) or follow-up.
5. Ask the user whether to fix the must-fix items now.
