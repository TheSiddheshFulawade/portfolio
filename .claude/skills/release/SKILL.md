---
name: release
description: Promote develop to main for a release - one /review, changelog, version, release PR and the manual checks. Never merges, tags or deploys without the user's go-ahead.
disable-model-invocation: true
argument-hint: "[version, e.g. 1.0.0]"
---

Prepare release: $ARGUMENTS

1. Confirm `develop` is up to date and green: `git fetch origin`, and `gh run list --branch develop --limit 3`
   once CI exists (v1.1). Run `npm run verify` locally.
2. Create `release/v<version>` from `origin/develop`.
3. Run `/review` (once per release). Any high or critical finding stops the release; fix it first.
4. Manual checks on the Cloudflare preview URL of `develop`, recorded in the PR: Lighthouse mobile on Home
   and one detail page (budgets in constitution §3), the Playwright smoke test (axe), keyboard pass,
   320 px layout, both themes.
5. On the release branch, move CHANGELOG.md "Unreleased" entries under `## v<version> (YYYY-MM-DD)` and bump
   the version in `apps/web/package.json`. Commit `chore(release): v<version>`.
6. Open the release PR to **main** (`gh pr create --base main`): what ships, review result, the manual check
   results, the rollback path (Cloudflare Pages: roll back to the previous deployment), and the
   Claude Code attribution line.
7. Ask the user to approve. On an explicit yes: `gh pr merge <n> --merge`, tag `v<version>` on main, push the tag.
   Cloudflare Pages deploys `main` to production by itself; confirm the live URL loads and report it.
8. Bring the release commit back to `develop` with a PR from `main` (or fast-forward if possible).
   Delete the release branch on origin and locally.
