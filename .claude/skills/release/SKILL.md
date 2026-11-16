---
name: release
description: Promote develop to main - full audit, changelog, version, release PR, and the deployment checklist. Never merges, tags or deploys without the user's go-ahead.
disable-model-invocation: true
argument-hint: "[version, e.g. 1.2.0]"
---
Prepare release: $ARGUMENTS

Use when `develop` holds something significant (a finished spec or a set of specs).

1. Confirm `develop` is up to date and green: `git fetch origin`, `gh run list --branch develop --limit 3`.
2. Create `release/v<version>` from `origin/develop`.
3. Run full-repo audits in parallel: `security-auditor` and `perf-auditor`.
   Any high or critical finding stops the release; report it.
4. On the release branch, move CHANGELOG.md "Unreleased" entries under `## v<version> (YYYY-MM-DD)`
   and bump versions in package.json / pom.xml. Commit `chore(release): v<version>`.
5. Open the release PR to **main** with `gh pr create --base main`: summary of specs shipped,
   audit results, deployment checklist (staging deploy, ZAP baseline, k6 smoke, header scan,
   Lighthouse on production URLs, rollback command), and the Claude Code attribution line.
6. Ask the user to approve. On an explicit yes: `gh pr merge <n> --merge` (merge commit, keeps history),
   then tag `v<version>` on main and push the tag.
7. Bring the release commit back: open a PR from `main` to `develop` (or fast-forward if possible)
   so both branches share the changelog and version bump.
8. Deployment from main happens through CI after the user confirms. Never deploy by hand.
