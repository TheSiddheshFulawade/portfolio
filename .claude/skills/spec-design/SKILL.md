---
name: spec-design
description: Produce design.md (and ADRs) for an approved spec using the spec-architect agent.
disable-model-invocation: true
argument-hint: NNN-feature-name
---
Design spec: $ARGUMENTS

1. Check `specs/$ARGUMENTS/requirements.md` ends with `Status: APPROVED`. If not, stop and say so.
2. Delegate to the `spec-architect` sub-agent: write `specs/$ARGUMENTS/design.md` from the template,
   plus any ADRs in `docs/adr/` (use the `/adr` format).
3. Summarise for the user: the approach, key decisions and trade-offs, new dependencies (each needs an ADR),
   risks and open questions. Ask the user to review and approve design.md. Do not create tasks or code.
