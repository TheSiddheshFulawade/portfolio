# Siddhesh Fulawade · Portfolio

Personal portfolio of a full stack Java engineer working on payments and distributed systems,
plus **Settlement Lab**, an open-source concurrent settlement engine you can run live on the site.

Built end to end with Claude Code using spec-driven development: every feature starts as a spec in
`specs/`, gets two human approvals, and is implemented test-first by specialised agents.

| Path | What |
|---|---|
| `apps/web` | Angular site, prerendered, on Cloudflare Pages |
| `settlement-lab` (separate repo) | Java engine and, from v2, the Spring Boot API (ADR-0004) |
| `content/` | All site content as YAML/Markdown |
| `specs/` | Feature specs: requirements, design, tasks |
| `docs/adr/` | Architecture decision records |
| `.claude/` | Agents, skills, hooks and settings used to build this repo |

Plan and architecture: `docs/blueprint.html`.
