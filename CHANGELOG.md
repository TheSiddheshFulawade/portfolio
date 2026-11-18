# Changelog

## Unreleased
- Project scaffold: constitution, brief, Claude Code agents, skills, hooks and MCP configuration.
- Branch flow: work branches → develop (squash PRs) → main (release PRs); `/ship` command; hook blocks direct pushes to main and develop.
- Project brief approved: domain, no public availability line, public contact channels, employer naming rules.
- Spec 001 (monorepo and tooling) approved: requirements, design, 19 tasks; ADR 0001 baseline runtime dependencies, ADR 0002 dependency vulnerability scanning.
- `/review` and security-auditor diff against `origin/develop` (or `origin/main` for release branches and PRs into main) (001 T-01).
- `/review` takes its base from the open PR (else `main` for release branches and develop, else develop), accepts only `develop` or `main`, stops on an empty diff, warns about uncommitted work and records the reviewed commit; `/ship` re-checks base and head before merging; security-auditor follows the same base rule.
- Spec 001 security revision: Maven runner argument allow-list with a single command string on Windows, CI gate accepts a skipped app job only when `changes` marks it unchanged, Renovate validator locked in `tools/renovate/` (no `npx`).
- Agent safety: CLAUDE.md policy section; guard hooks block security-tool tampering, OS damage, credential access and malware techniques and prompt for system-level or irreversible operations; settings disable bypass mode, refuse file writes outside the working directories and deny home credential paths.
