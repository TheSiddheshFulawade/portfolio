---
name: spec-tasks
description: Break an approved design into small, test-first tasks in tasks.md.
disable-model-invocation: true
argument-hint: NNN-feature-name
---
Create tasks for spec: $ARGUMENTS

1. Check `specs/$ARGUMENTS/design.md` ends with `Status: APPROVED`. If not, stop and say so.
2. Delegate to the `spec-architect` sub-agent to write `specs/$ARGUMENTS/tasks.md` from the template:
   tasks of half a day or less, tagged [web]/[api]/[content]/[infra], each naming the test to write first,
   the REQ ids covered and the done criteria. Every REQ id must be covered by at least one task.
3. Show the task list and point out which tasks can run in parallel worktrees.
