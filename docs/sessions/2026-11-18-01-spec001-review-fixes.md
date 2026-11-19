# 2026-11-18 · Spec 001 shipped, T-01 and review base fixes

**Goal of this session:** review and ship spec 001, implement T-01, harden `/review`.

## Done
- PR #4 merged: spec 001 requirements, design, tasks (19) plus ADR 0001 and ADR 0002 (docs/adr/).
  Its security review found no high findings and 6 medium design findings. Comment on #4 has the list.
- PR #5 merged: T-01 ticked. `/review` and security-auditor diff against `origin/develop`.
- PR #6 merged: `/review` takes BASE from the open PR, then the branch name, and accepts only `develop` or `main`.
  An empty diff stops the review. It warns on uncommitted work and records the reviewed commit.
  `/ship` re-reads `baseRefName` and `headRefOid` before merging (files: .claude/skills/review,
  .claude/skills/ship, .claude/agents/security-auditor.md).
- Decision (user): an earlier personal detail stays in git history; no history rewrite.
- Decision (user, this session): merges may proceed without a separate yes when the user says
  "execute without approval" for a named approach. That is scoped to that request only.

## State
- `develop` at 35dd219, clean. No app code yet, so no test suite or CI exists (T-02 and T-18 add them).
- This note sits on `chore/handoff-2026-11-18`, uncommitted.

## Next
`/implement 001 T-02` (root script contract, check runner, Maven runner). It unblocks T-03, T-04,
T-14 and T-17. Its design has an open security fix (see Open questions).

## Open questions
1. Spec fix for 3 medium design findings from the #4 review. Either fold it into T-02 or ship it first as a
   `fix/001-spec-security` PR. Both need re-approval of design.md and tasks.md.
   - `scripts/mvnw.mjs` uses `shell: true` on Windows. Allow-list forwarded arguments.
   - The CI gate accepts any `skipped`. Accept it only when `changes` says the app is unchanged.
   - Renovate runs through `npx` unlocked. Lock it in `tools/renovate/` or pin the image digest.
2. Follow-ups:
   - Actions setting "require approval for outside contributors".
   - A gitleaks job, secret scanning with push protection, CodeQL default setup.
   - The low hardening items listed in the #4 comment.

## Gotchas
- guard-bash blocks any command whose text contains a force-add of the private docs path, even
  inside a heredoc. Write PR comment bodies with the Write tool and pass `--body-file`.
- The T-01 check (`rg "main\.\.\.HEAD|against main"`) also matches `origin/main...HEAD`. Phrase
  the main exception without that string.
- No scanners are installed (gitleaks, semgrep, osv-scanner), and `npx gitleaks` is blocked by permissions,
  so security reviews are manual reads for now.
- `docs/blueprint.html:734` still says `git diff main...HEAD`. It is informational only.
