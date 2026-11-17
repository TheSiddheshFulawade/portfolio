---
name: review
description: Review the current branch with security, UI and performance auditors in parallel and merge their findings.
disable-model-invocation: true
argument-hint: "[optional paths or routes]"
---
Review the current branch against develop. Scope: $ARGUMENTS

Base: `origin/develop`. Exception: on a `release/*` branch or a PR into `main`, use `origin/main`.
Always diff against the remote ref, so a stale local branch in a worktree cannot widen the diff.

1. Get the diff: `git fetch origin develop`, then `git diff origin/develop...HEAD --stat` and the
   full diff of changed files (for the exception above, fetch `main` and put `origin/main` in place of `origin/develop`).
2. In parallel, delegate to:
   - `security-auditor` always;
   - `ui-reviewer` when files under apps/web or content changed (start the dev server first if needed);
   - `perf-auditor` when files under apps/web changed.
3. Check traceability yourself: each changed behaviour maps to a REQ id and a test.
4. Merge the findings into one list ordered by severity, removing duplicates. Mark each as
   must-fix (blocks the PR) or follow-up.
5. Ask the user whether to fix the must-fix items now.
