# Changelog

## Unreleased
- Project scaffold: constitution, brief, Claude Code agents, skills, hooks and MCP configuration.
- Branch flow: work branches → develop (squash PRs) → main (release PRs); `/ship` command; hook blocks direct pushes to main and develop.
- Project brief approved: domain, no public availability line, public contact channels, employer naming rules.
- Spec 001 (monorepo and tooling) approved: requirements, design, 19 tasks; ADR 0001 baseline runtime dependencies, ADR 0002 dependency vulnerability scanning.
- `/review` and security-auditor diff against `origin/develop` (or `origin/main` for release branches and PRs into main) (001 T-01).
- `/review` takes its base from the open PR (else `main` for release branches and develop, else develop), stops on an empty diff, and warns about uncommitted work; security-auditor follows the same base.
