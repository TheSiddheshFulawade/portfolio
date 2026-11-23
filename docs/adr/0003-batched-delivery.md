# 0003 · Batched delivery: 4–5 tasks per review checkpoint

## Status
Superseded by [ADR-0004](0004-fast-track-v1.md) (2026-11-19). Was: accepted (2026-11-18, user decision).

## Context
Constitution 1.4 required one task per Claude session, with `/review`, a PR and a `/handoff` after
each task. The user found that per-task PRs and reviews cost more of their time than they return:
most tasks only make sense together with their neighbours, and progress on the actual portfolio
was slow. The quality bars (tests first, coverage gates, accessibility, performance, security,
disclosure) are not the problem and stay unchanged.

## Decision
- Work is grouped into **batches of 4–5 related tasks** on one branch `feature/<spec>-batch-<n>`
  from `develop`.
- Per task, without user involvement: failing test first, implementation, full local suite green,
  task ticked in `tasks.md`, one local commit.
- Questions are collected and asked at the checkpoint. Work stops early only for a question that
  would force rework across several tasks, or that touches security, credentials or something
  irreversible; independent tasks continue meanwhile.
- **Checkpoint** at the end of each batch: `/review` on the whole batch, fixes, full suite re-run,
  one CHANGELOG entry per task, push, **one PR** to `develop` with the review as a comment, a
  summary of what can be seen and tested, and the collected questions. The user approves the merge.
- The work branch is pushed (no PR) at the end of every session as a backup.
- Anything that changes the site's look is shown to the user before several pages build on it.

## Consequences
- Positive: far fewer interruptions for the user; reviews look at meaningful, coherent changes.
- Negative: a review covers more code at once, and a wrong direction is found later. Mitigated by
  the 4–5 task cap, early stops for cross-cutting questions, and showing visual work early.
- Unchanged: constitution 1.5 (PR flow), 1.6 (review comment on every PR, no open high findings,
  user approves every merge), 2.x quality gates and every security control.

## Related
Constitution 1.4 (amended) · CLAUDE.md "Workflow" and "Definition of done"
