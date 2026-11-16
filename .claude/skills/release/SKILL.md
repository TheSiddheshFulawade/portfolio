---
name: release
description: Prepare a release - full audit, changelog, version, and the deployment checklist. Never deploys on its own.
disable-model-invocation: true
argument-hint: "[version, e.g. 1.2.0]"
---
Prepare release: $ARGUMENTS

1. Confirm main is clean and CI is green (`gh run list --branch main --limit 3` if gh is available).
2. Run `/review`-level audits on the whole repo: `security-auditor` and `perf-auditor` in parallel.
   Any high or critical finding stops the release.
3. Move CHANGELOG.md "Unreleased" entries under the new version with today's date.
4. Produce the deployment checklist for the user: staging deploy, ZAP baseline, k6 smoke, header scan,
   Lighthouse on production URLs after deploy, rollback command.
5. Propose the git tag `v<version>`. Do not tag, push or deploy without the user's explicit go-ahead.
