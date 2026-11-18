# Portfolio: Siddhesh Fulawade

Personal portfolio for a full stack Java engineer (payments, distributed systems) targeting
engineering roles at global banks. Built with Claude Code using spec-driven development.

Monorepo:
- `apps/web`  Angular (standalone, signals, zoneless), prerendered (SSG)
- `apps/api`  Spring Boot 4, Java 25, hosts Settlement Lab + contact API
- `content/`  YAML/Markdown, the single source of truth for all site content
- `specs/`    one folder per feature: requirements.md, design.md, tasks.md
- `docs/`     brief, ADRs, session handoffs, blueprint

## Non-negotiables (full text: specs/000-constitution.md)
- No spec, no code. Implement only tasks from an approved `specs/NNN-*/tasks.md`.
- Tests first for every task. Coverage gates: api ≥85% lines, web ≥80% lines.
- Never hard-code content in components. Read it from `content/` through the content loader.
- No new runtime dependency without an ADR in `docs/adr/`.
- Budgets: initial JS ≤120 KB gzipped, LCP ≤1.8 s on mobile, CLS ≤0.05.
- Accessibility: WCAG 2.2 AA. Respect `prefers-reduced-motion`.
- Employer work (ReBIT / e-Kuber) is experience only: resume-level facts, no system
  diagrams, internal names, code, volumes or logos. Settlement Lab is original work.
- Never read or write secrets (`.env*`, `*.pem`, `secrets/`). Never push to `main` or `develop` directly.
- `docs/private/` holds personal documents. Never copy anything from it into a tracked file
  without the user's approval (no phone number, no personal email).

## Agent safety
Enforced by `.claude/settings.json` (permission rules) and `.claude/hooks/guard-bash.mjs` /
`protect-secrets.mjs` (block or force a prompt). These rules apply in every permission mode.
- Never run commands that damage the OS, corrupt data or weaken system security. Never write,
  download or run malware, keyloggers, reverse shells, obfuscated or encoded payloads.
- Never disable or reconfigure Windows Defender, the firewall, UAC, SmartScreen, AMSI, event logs
  or any other security protection. Never add antivirus exclusions.
- Never read, print, copy or change credentials: `.env*`, keys and certificates, `~/.ssh`,
  `~/.aws`, `~/.config/gh`, `~/.npmrc`, git credential helpers, tokens in environment variables.
- Ask first for anything destructive, irreversible, system-wide or outward-facing: global or system
  package installs, registry, services, scheduled tasks, persistent env vars, elevation, shutdown,
  `git reset --hard`, `git clean`, history rewrites, GitHub repo settings or secrets, file uploads,
  and changes to Claude Code settings, hooks or MCP config.
- Stay project-scoped: work inside the repo, the session scratchpad and `.cache/`. File-tool writes
  outside the working directories are refused by setting.
- Before a risky command, state what it does and why it is needed. If a guard blocks something
  that is genuinely needed, ask the user; never work around a guard.
- Routine coding, testing, debugging, docs and git work on branches run without extra prompts.

## Commands
Web (from apps/web, once spec 001 creates it): `npm run dev | test | e2e | lint | typecheck | build`
API (from apps/api): `./mvnw verify` · native: `./mvnw -Pnative package` (Windows: `mvnw.cmd`)

## Where knowledge lives
Load the matching skill before working in an area:
- design-system · angular-standards · spring-standards · spec-driven
- content-model · security-baseline · testing-playbook

## Workflow
`/spec-new` → you approve → `/spec-design` → you approve → `/spec-tasks` →
`/implement <spec> <task>` (one task per session) → `/review` → `/ship` → `/handoff`

## Branches
- `main`: production. Changes only through a release PR from `develop` (`/release`), merge commit, tag `vX.Y.Z`.
- `develop`: integration. Changes only through PRs from short-lived branches, squash-merged.
- Work branches from `develop`: `feature/<spec>-<task>` (e.g. `feature/010-T03`), `fix/<topic>`, `chore/<topic>`.
- `/ship` pushes the branch, opens the PR to `develop`, posts the review on it, and merges only after the user says yes.
- Merging and pushing always need the user's explicit go-ahead in the current session.

## Definition of done
Task ticked in tasks.md · tests green · quality gate passes · `/review` has no high findings ·
CHANGELOG entry · `/handoff` written at the end of the session.

## Environment
Windows 11. Hooks are Node scripts so they run the same in CI. Use forward slashes in paths.
