---
name: implement
description: Implement the next tasks of an approved release spec on today's branch, test-first where the spec names tests, with local commits and no prompts (ADR-0004).
disable-model-invocation: true
argument-hint: NNN-release [task ids, default = today's tasks]
---

Implement: $ARGUMENTS

1. Read `specs/<spec>/spec.md`. It must be APPROVED. Pick the named tasks, or the next open tasks for today.
2. Branch: if not already on today's branch, create `feature/<release>-day-N` from the latest `develop`
   (`git fetch origin`, `git switch -c feature/v1-day-N origin/develop`). Never work on `main` or `develop`.
3. Per task, in the main session (delegate only copywriting to `content-editor`):
   - load the matching skills (angular-standards, design-system, content-model, testing-playbook);
   - write the tests the spec names first and see them fail for the right reason;
   - implement, then run typecheck, lint and the tests for what changed;
   - check the task's acceptance checks, tick it in spec.md, add a CHANGELOG line under "Unreleased";
   - commit locally with a Conventional Commit message, e.g. `feat(web): home page (002 V1-05)`.
4. Decide routine questions yourself and note them for the handoff. Stop and ask only about merges, pushes,
   outward-facing actions (deploys, DNS, repos, cloud resources), money or real product choices.
5. At the end of the day's tasks, suggest `/ship`.
