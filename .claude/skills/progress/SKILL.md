---
name: progress
description: Status and estimated percent complete of portfolio, payflow and settlement-lab from git, GitHub and the spec checkboxes, without building or testing. Use when the user asks for status, progress, percent done, what is left or the go-live dates.
argument-hint: '[portfolio|payflow|lab|all] [--pace=6]'
---

Run this one read-only command and nothing else: `node "${CLAUDE_SKILL_DIR}/progress.mjs" $ARGUMENTS`

It only fetches and reads: no builds, no tests, no agents. Then answer in at most 12 lines:

1. One line per project: percent, tasks done, about how many hours are left, date at this pace against the target.
2. Anything only on this laptop, any red check, any site that doesn't answer.
3. The one next step for each project, and what waits on the user.

Say that the percentages are estimates weighted by effort, and that "merged only" is the proven figure. Never round up, and
never call an unmerged task done.
