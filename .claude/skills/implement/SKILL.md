---
name: implement
description: Implement exactly one task from a spec's tasks.md, test-first, with the right engineer agent.
disable-model-invocation: true
argument-hint: NNN-feature-name T-NN
---
Implement: $ARGUMENTS

1. Read the task in `specs/<spec>/tasks.md` and confirm it is unticked and its dependencies are done.
   If the working tree has unrelated uncommitted changes, stop and tell the user.
2. Create the work branch from the latest `develop`: `git fetch origin` (if a remote exists),
   `git switch -c feature/<NNN>-<task> origin/develop` (or local `develop`), e.g. `feature/010-T03`.
   Never work on `main` or `develop` directly.
3. Delegate to `test-engineer`: write the failing tests for this task and confirm they fail for the right reason.
4. Delegate to `angular-engineer` for [web] tasks, `spring-engineer` for [api] tasks,
   or `content-editor` for [content] tasks: make the tests pass, then refactor with tests green.
5. Run the relevant checks yourself (typecheck, lint, tests, coverage). Fix failures.
6. Tick the task in tasks.md and add a CHANGELOG.md line under "Unreleased".
7. Report: files changed, tests added, results, and anything uncertain.
8. Ask the user whether to commit. On yes, commit with a Conventional Commit message
   (e.g. `feat(lab): ordered locking ledger (010 T-01)`), then suggest `/ship` to open the PR to develop.
