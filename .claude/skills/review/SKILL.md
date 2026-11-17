---
name: review
description: Review the current branch with security, UI and performance auditors in parallel and merge their findings.
disable-model-invocation: true
argument-hint: "[optional paths or routes]"
---
Review the current branch against develop. Scope: $ARGUMENTS

Pick the base (BASE), first match wins:
- an open PR exists for this branch: its target, from `gh pr view --json baseRefName -q .baseRefName`;
- the branch is `release/*` or `develop` itself: `main`;
- otherwise: `develop`.
Always diff against the remote ref `origin/BASE`, so a stale local branch in a worktree cannot widen the diff.

1. Get the diff: `git fetch origin BASE`, then `git diff origin/BASE...HEAD --stat` and the full diff
   of changed files.
   - If `git status --porcelain` is not empty, warn that uncommitted work is not reviewed and ask
     whether to commit it first.
   - If the diff is empty, stop and say "nothing to review against origin/BASE". Never report an
     empty diff as a clean review.
2. In parallel, delegate to (pass BASE on):
   - `security-auditor` always;
   - `ui-reviewer` when files under apps/web or content changed (start the dev server first if needed);
   - `perf-auditor` when files under apps/web changed.
3. Check traceability yourself: each changed behaviour maps to a REQ id and a test.
4. Merge the findings into one list ordered by severity, removing duplicates. Mark each as
   must-fix (blocks the PR) or follow-up.
5. Ask the user whether to fix the must-fix items now.
