---
name: spec
description: Write one release spec (requirements, short design and feature-sized tasks) in specs/NNN-name/spec.md for a single user approval. Replaces spec-new, spec-design and spec-tasks (ADR-0004).
disable-model-invocation: true
argument-hint: NNN-release-name "one-line goal"
---

Write a release spec. Arguments: $ARGUMENTS

1. Load the `spec-driven` skill. Read `specs/000-constitution.md`, `docs/brief.md` and the latest ADRs
   (ADR-0004 defines the releases and their scope).
2. Ask the user at most 3 questions, in one message, and only about real product choices. Decide the rest
   and list the decisions in the spec.
3. Write `specs/<NNN-release-name>/spec.md` from `.claude/skills/spec-driven/templates/spec.md`:
   goal, EARS requirements with ids, a short design (components, files, data, risks), feature-sized tasks
   grouped by day with acceptance checks and the tests the constitution requires, and out of scope.
4. Every requirement is covered by at least one task. New runtime dependencies need an ADR (`/adr`).
5. Leave `Status: DRAFT`, show a short summary and ask the user to approve once. Do not write code.
