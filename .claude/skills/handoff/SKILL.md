---
name: handoff
description: Write a short session handoff note (at most 20 lines) so the next session can resume without re-reading everything.
disable-model-invocation: true
---

Write `docs/sessions/YYYY-MM-DD-NN-<short-topic>.md`: today's date, and NN = the next two-digit
sequence number for that date (01 for the first note of the day). The SessionStart hook picks the
latest note by date and NN, so never reuse or skip a number.

At most 20 lines, four sections:

- **Done**: tasks ticked, PRs, decisions made on the user's behalf (link ADRs)
- **State**: branch, what is merged, checks green or red, anything uncommitted
- **Next**: the very next task (`/implement <spec> <task>`) and why
- **Open questions** for the user (or "none")

No secrets or personal data. Commit it on the current work branch, or on `chore/handoff-<date>` if none.
