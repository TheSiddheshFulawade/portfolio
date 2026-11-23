# 0005 · Delegated merges on required green CI

## Status

Accepted (2026-11-23, user decision). Amends ADR-0004 (process) and the constitution (1.4, 1.6).

## Context

Under ADR-0004 every merge waited for the user's yes. With v1 near launch and the user's time going to interview
prep, the wait became the bottleneck. GitHub now enforces the gate the user cared about: `develop` and `main`
require the "verify and smoke test" check, so a pull request cannot merge red.

## Decision

- A master session runs the repo as project manager and delegates work to subagents. Only the `git-ops` agent
  (`.claude/agents/git-ops.md`) pushes, opens pull requests and merges.
- Work PRs to `develop` are squash-merged by git-ops once the required check is green. Release PRs to `main`
  are merged (merge commit) and tagged by git-ops after `/review` (no high findings), Lighthouse and axe pass.
- One work branch and one PR per task (`feature/<spec>-<task>-<slug>`), not one per day.
- The agent still stops for hard gates: money or cloud resources; the Cloudflare dashboard, DNS and secrets;
  GitHub repo settings; publishing any resume PDF; approving note content; a product choice no approved spec covers.
- `guard-bash` blocks force pushes, pushes to `main`/`develop`, deleting them on the remote, `--admin`,
  protection or ruleset writes, `gh repo delete` and disabling workflows, whatever the permission mode.

## Consequences

- Faster flow; the user reviews outcomes in handoffs and chief reports instead of approving each merge.
- Safety rests on branch protection plus the hook. Pattern rules are a safety net, not a sandbox.
- Rollback for a bad release: Cloudflare Pages "roll back to previous deployment", then a fix PR.
