---
name: adr
description: Record an architecture decision in docs/adr using a short, numbered ADR.
disable-model-invocation: true
argument-hint: "decision title"
---
Write an ADR titled: $ARGUMENTS

1. Find the next number in `docs/adr/` (4 digits, e.g. 0007).
2. Create `docs/adr/NNNN-kebab-title.md` with these sections:
   - Status: Proposed (the user changes it to Accepted)
   - Context: the forces and constraints
   - Decision: what we will do, in one or two sentences
   - Alternatives considered: each with why it lost
   - Consequences: positive, negative, and what would make us revisit it
   - Links: related specs and REQ ids
3. Keep it under one page. Ask the user to accept it.
