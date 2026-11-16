---
name: implement
description: Implement exactly one task from a spec's tasks.md, test-first, with the right engineer agent.
disable-model-invocation: true
argument-hint: NNN-feature-name T-NN
---
Implement: $ARGUMENTS

1. Read the task in `specs/<spec>/tasks.md` and confirm it is unticked and its dependencies are done.
   If the working tree has unrelated uncommitted changes, stop and tell the user.
2. Make sure work is on a feature branch named `<spec>/<task>` (e.g. `010-settlement-lab/T-03`), not main.
3. Delegate to `test-engineer`: write the failing tests for this task and confirm they fail for the right reason.
4. Delegate to `angular-engineer` for [web] tasks, `spring-engineer` for [api] tasks,
   or `content-editor` for [content] tasks: make the tests pass, then refactor with tests green.
5. Run the relevant checks yourself (typecheck, lint, tests, coverage). Fix failures.
6. Tick the task in tasks.md and add a CHANGELOG.md line under "Unreleased".
7. Report: files changed, tests added, results, and anything uncertain. Suggest `/review` next.
   Do not commit unless the user asks.
