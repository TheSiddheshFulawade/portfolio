---
name: spec-new
description: Start a new feature spec from a one-line idea and write requirements.md only.
disable-model-invocation: true
argument-hint: NNN-feature-name "one-line idea"
---
Start a new spec. Arguments: $ARGUMENTS

1. Load the `spec-driven` skill. Read `specs/000-constitution.md` and `docs/brief.md`.
   If the brief is still DRAFT, stop and ask the user to approve it first.
2. Create `specs/<NNN-feature-name>/requirements.md` from `.claude/skills/spec-driven/templates/requirements.md`.
3. Ask the user at most 5 clarifying questions, in one message. Wait for answers.
4. Write user stories and EARS acceptance criteria with ids `REQ-<AREA>-NNN`, non-functional items,
   out-of-scope list and remaining open questions. Leave `Status: DRAFT`.
5. Show a short summary and ask the user to review and approve. Do not design or write code.
