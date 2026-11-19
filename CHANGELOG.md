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
- Root script contract (`package.json`, scripts only), `check:repo` runner with the scripts-contract check, and `scripts/mvnw.mjs` with the argument allow-list and a single command string on Windows (001 T-02).
- Batched delivery: 4-5 tasks per review checkpoint (ADR-0003, constitution 1.4); local commits run without a prompt, pushes still ask, and the guard blocks commits on main/develop and asks before `git commit --amend`.
- Line endings, editor rules and Node 24.22.3 pin, with line-endings and toolchain repo checks (001 T-03).
- Angular 22 static, zoneless web app with exact pins and the web-config repo check, including lockfile registry and integrity rules (001 T-05).
- ESLint (angular-eslint, prefix `sf`, OnPush, template accessibility) and Prettier gate for apps/web (001 T-06).
- Web script set, Vitest with an 80 % line coverage gate, and an e2e stub (001 T-07).
- Placeholder home route, prerendered, with a post-build check that fails without the heading or if a server bundle appears; critical-CSS inlining off so no executable inline script ships (001 T-08).
