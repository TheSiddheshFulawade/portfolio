# Portfolio: Siddhesh Fulawade

Personal portfolio for a full stack Java engineer (payments, distributed systems) targeting
engineering roles at global banks. Current plan: **ADR-0004 fast track**, delegated merges per **ADR-0005**.

Repo (website and content only):

- `apps/web` Angular (standalone, signals, zoneless), prerendered (SSG), hosted on Cloudflare Pages
- `content/` YAML/Markdown, the single source of truth for all site content
- `specs/` one `spec.md` per release (requirements, short design, tasks)
- `docs/` brief, ADRs, session handoffs, `settlement-lab-spec.md`, blueprint (historic)

Settlement Lab lives in its own public repo `settlement-lab` (engine now, Spring Boot API in v2 at
`api.siddheshfulawade.com`). It is built by a separate session; do not edit it from here.

## Non-negotiables (full text: specs/000-constitution.md)

- No spec, no code. Implement only tasks from an approved `specs/NNN-*/spec.md`.
- Tests where the spec names them: content loader tests and the Playwright smoke test in v1.
- Never hard-code content in components. Read it from `content/` through the content loader.
- No new runtime dependency without an ADR in `docs/adr/`.
- Budgets (checked by hand before each release): initial JS ≤120 KB gzipped, LCP ≤1.8 s mobile, CLS ≤0.05.
- Accessibility: WCAG 2.2 AA. Respect `prefers-reduced-motion`.
- Employer work (ReBIT / e-Kuber) is experience only: resume-level facts, no system diagrams,
  internal names, code, volumes, throughput figures or logos. Describe guarantees instead.
- Numbers in international format (100,000). Site email: hello@siddheshfulawade.com.
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
- Stay project-scoped: work inside the repo, the session scratchpad and `.cache/`.
- Before a risky command, state what it does and why. If a guard blocks something genuinely needed,
  ask the user; never work around a guard.

## When to ask the user (hard gates, ADR-0005)

Stop only for: money or cloud resources · the Cloudflare dashboard, DNS and secrets · GitHub repo settings ·
publishing any resume PDF (none goes public before Dec 1) · approving note content · a product choice no approved
spec covers. When a gate blocks a task, write it under "Waiting on user" in the handoff, move to the next unblocked
task, and never work around the gate. Decide everything else, note it in the handoff, keep going.

## Commands and skills

Web (from `apps/web`): `npm run dev | test | e2e | lint | typecheck | build`. Root: `npm run verify`.
Load the matching skill first: design-system · angular-standards · content-model · security-baseline ·
testing-playbook · spec-driven. Windows 11; hooks are Node scripts run from `$CLAUDE_PROJECT_DIR`.

## Workflow (ADR-0005)

The master session is the PM and delegates. `/spec` → user approves once → per task: `test-engineer` (failing
tests) → `angular-engineer` / `content-editor` → `npm run verify` → `security-auditor` / `ui-reviewer` /
`perf-auditor` where the change needs it → `/ship` (`git-ops` opens the PR and merges on required green CI)
→ one handoff line. Per release: `/release` (`/review`, Lighthouse, axe) → git-ops merges to `main` and tags.

## Branches

- `main`: production (Cloudflare Pages). Changes only through a release PR from `develop`, merge commit, tag `vX.Y.Z`.
- `develop`: integration and Cloudflare preview. Changes only through squash-merged PRs.
- Both require the "verify and smoke test" check. Only `git-ops` pushes, opens PRs and merges, on green only.
- Work branches from `develop`: `feature/<spec>-<task>-<slug>`, `fix/<topic>`, `chore/<topic>`, `docs/<topic>`.
  Delete after merge. Never push `feature/v1-resume`.

## Definition of done

Per task: acceptance checks met · named tests green · `npm run verify` green · ticked in `spec.md` ·
CHANGELOG line · merged by git-ops on green CI · handoff line.
Per session: `/handoff` (≤ 20 lines) with "Waiting on user".
Per release: `/review` with no high findings · Lighthouse and axe gates · tagged release · production verified.
