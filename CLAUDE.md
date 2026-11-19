# Portfolio: Siddhesh Fulawade

Personal portfolio for a full stack Java engineer (payments, distributed systems) targeting
engineering roles at global banks. Current plan: **ADR-0004 fast track** (v1 live Sun 22 Nov 2026).

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

## When to ask the user

Only for: merges and pushes; anything outward-facing (deploys, DNS, creating repos or cloud
resources); money; real product choices. Decide everything else, note it in the handoff, keep going.

## Commands and skills

Web (from `apps/web`): `npm run dev | test | e2e | lint | typecheck | build`. Root: `npm run verify`.
Load the matching skill first: design-system · angular-standards · content-model · security-baseline ·
testing-playbook · spec-driven. Windows 11; hooks are Node scripts run from `$CLAUDE_PROJECT_DIR`.

## Workflow (ADR-0004)

`/spec` (one `spec.md` per release) → user approves once → each day: `feature/<release>-day-N` from
`develop`, `/implement` tasks (local commits, no prompts) → `/ship` (one PR, merged after the user's yes)
→ `/handoff`. Per release: `/release` runs `/review`, then the release PR to `main` deploys production.

## Branches

- `main`: production (Cloudflare Pages). Changes only through a release PR from `develop`, merge commit, tag `vX.Y.Z`.
- `develop`: integration and Cloudflare preview. Changes only through squash-merged PRs.
- Work branches from `develop`: `feature/v1-day-N`, `fix/<topic>`, `chore/<topic>`. Delete after merge.
- Merging and pushing always need the user's explicit go-ahead in the current session.

## Definition of done

Per task: acceptance checks met · named tests green · ticked in `spec.md` · local commit.
Per day: one PR, lint, typecheck, tests and build green, CHANGELOG line per task, `/handoff` (≤ 20 lines).
Per release: `/review` with no high findings · manual Lighthouse and axe check · tagged release.
