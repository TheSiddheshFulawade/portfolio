---
name: ship
description: Push the current work branch, open a PR to develop, post the review on it, and squash-merge after the user approves.
disable-model-invocation: true
argument-hint: "[optional PR title]"
---
Ship the current branch to `develop`. Title override: $ARGUMENTS

Requires the GitHub CLI (`gh auth status`). If it is missing or not logged in, stop and tell the user.

1. **Check the branch.** It must be `feature/*`, `fix/*` or `chore/*`, never `main` or `develop`.
   The working tree must be clean; if not, list the changes and ask whether to commit them.
2. **Sync.** `git fetch origin` and `git rebase origin/develop`. On conflicts, stop and explain them.
3. **Gate.** Run the checks for what changed (typecheck, lint, tests). Fix failures before continuing.
4. **Push** the branch: `git push -u origin <branch>`.
5. **Open the PR** to `develop` with `gh pr create --base develop`:
   - Title: Conventional Commit style, e.g. `feat(lab): ordered locking ledger (010 T-01)`
   - Body: what changed and why, spec and REQ ids covered, tests added, screenshots if UI,
     a checklist from the constitution's Definition of done, and the attribution line
     `🤖 Generated with [Claude Code](https://claude.com/claude-code)` at the end.
   If a PR for this branch already exists, update it instead.
6. **Review.** Run `/review`. Post the merged findings as one PR comment (`gh pr comment`).
   Must-fix findings: fix them on the branch, push, and re-run only the affected reviewer.
   The commit that last passed review (full or partial re-run) is the reviewed commit.
7. **Wait for CI** once (`gh pr checks --watch`, if workflows exist). Report the result.
8. **Ask the user** in one line: PR link, review result, CI result, "merge to develop?".
   Merge only on an explicit yes in this session. Right before merging, re-read
   `gh pr view <n> --json baseRefName,headRefOid` and refuse if the base is not the BASE `/review`
   used or the head commit is not the one reviewed; re-run `/review` in that case.
   `gh pr merge <n> --squash --delete-branch`. Never use `--admin`.
9. **Clean up.** `git switch develop`, `git pull --ff-only`, delete the local branch.
   Suggest `/handoff` if the session is ending.
