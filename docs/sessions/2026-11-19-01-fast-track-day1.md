# 2026-11-19 · Fast track (ADR-0004) and v1 day 1

**Done**

- PR #12 merged: ADR-0004 fast track, constitution amended, spec 001 closed, spec 002 v1 site, `/spec` and the skill and hook updates, hooks run from `$CLAUDE_PROJECT_DIR`, `docs/settlement-lab-spec.md`.
- Day 1 (this PR): V1-01 content YAML and schemas from the resume, V1-02 content build with disclosure rules and `ContentService`, V1-03 tokens, themes, fonts and reduced motion. Lumu title "Freelance Software Engineer"; the two ML projects are flagged `earlier: true` (no links).
- Decided on the user's behalf: `marked` pinned to 18.1.3 (18.2.1 was only 3 days old); employer ids such as `2024-11-rebit` are allowed as references, so the About page must label experience evidence by role and dates, never by company.

**State**

- `develop` has PR #12 and, after this PR merges, day 1. `npm run verify` green; initial JS 67 KB gzipped.
- The `settlement-lab` repo is separate (its own SPEC.md and CLAUDE.md); do not edit it from here.

**Next: a CLOUD session.** Start from `develop` on a new branch `feature/v1-day-2`. Run `npm ci` in `apps/web` (Node 24). Do Friday's tasks in `specs/002-v1-site/spec.md`: V1-04 app shell (with the theme toggle wired to `ThemeService`), V1-05 Home, V1-06 Experience. Then `/ship` one PR (merge only on the user's yes) and `/handoff` as `2026-11-20-01-*.md`.

**Open questions**

1. PennyWise repo URL (the user will reply on the day-1 PR); add it as `repo:` in `content/projects/pennywise.md`.
2. The user reviews the content wording tonight; fixes go in a later PR.
3. Saturday (V1-09): the user connects the repo to Cloudflare Pages (preview from `develop`).
