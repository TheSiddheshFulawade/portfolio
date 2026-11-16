---
name: handoff
description: Write a session handoff note so the next session can resume without re-reading everything.
disable-model-invocation: true
---
Write `docs/sessions/YYYY-MM-DD-<short-topic>.md` (today's date) with:

- **Goal of this session**: one line
- **Done**: tasks ticked, files changed, decisions made (link ADRs)
- **State**: branch name, tests passing or failing, anything uncommitted
- **Next**: the very next task to run (`/implement <spec> <task>`) and why
- **Open questions** for the user
- **Gotchas** discovered (things the next session would otherwise trip over)

Keep it under 40 lines. No secrets or personal data. Then tell the user it is a good point to start a fresh session.
