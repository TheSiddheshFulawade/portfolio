---
name: release
description: Promote develop to main for a release - /review, Lighthouse and axe gates, changelog, version, release PR merged and tagged by git-ops on green (ADR-0005).
disable-model-invocation: true
argument-hint: "[version, e.g. 1.0.0]"
---

Prepare release: $ARGUMENTS

1. **develop is green.** `git fetch origin`, `gh run list --branch develop --limit 3` (latest run green),
   `npm run verify` locally on `origin/develop`.
2. Create `release/v<version>` from `origin/develop`.
3. **Gate (all three must pass; any high or critical finding stops the release until fixed on develop):**
   - `/review` against `main`: no high or critical findings open.
   - `perf-auditor`: Lighthouse mobile on Home and one detail page meets constitution §3
     (Performance ≥95, LCP ≤1.8 s, CLS ≤0.05, initial JS ≤120 KB gzipped).
   - `ui-reviewer`: axe on every route with zero serious violations, keyboard pass, 320 px layout, both themes.
     Run them against the Cloudflare preview of `develop` (or a local production build when the preview is stale).
4. On the release branch, move CHANGELOG.md "Unreleased" entries under `## v<version> (YYYY-MM-DD)` and bump
   the version in `apps/web/package.json`. Commit `chore(release): v<version>`. Run `npm run verify`.
5. **Delegate to `git-ops`** as a release: base `main`, merge commit (`--merge`), then tag `v<version>` on the
   merge commit and push the tag. The PR body lists what ships, the gate results from step 3 and the rollback
   path (Cloudflare Pages: roll back to the previous production deployment). No user yes is needed (ADR-0005).
6. **Verify production.** Cloudflare Pages deploys `main` by itself. Check the production URLs: every route
   returns 200, security headers present, `/api/visits` responds. Report the result.
7. **Back-merge.** Bring the release commit into `develop` with a `chore/back-merge-v<version>` PR from
   `origin/main` through git-ops (squash). Delete the release branch after merge.
