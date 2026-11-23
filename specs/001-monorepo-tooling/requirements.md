# 001 · Monorepo and tooling · Requirements

## Context
Every later spec needs somewhere to put code and a gate that proves it works. This spec creates
the Angular (`apps/web`) and Spring Boot (`apps/api`) skeletons, the Maven wrapper, lint, format
and test tooling, and a GitHub Actions pipeline that enforces the constitution's gates on every PR.

Serves:
- **Interviewer**: public code with visible, passing CI, tests and enforced architecture rules.
- **Site owner**: one command per check, the same locally and in CI, so `/implement` and `/ship` can trust it.

Decisions taken in clarification (2026-11-17): core CI gates only; plain root scripts (no
workspaces, no Nx/Turborepo); Spotless + palantir-java-format for Java; skeletons are bare plus
a health check / placeholder page.

## User stories
- As the site owner, I want one command per check (lint, format, typecheck, test, build) for each app,
  so that I and the agents run exactly what CI runs.
- As the site owner, I want every PR to `develop` and `main` checked automatically,
  so that `develop` always builds and nothing merges red.
- As an interviewer, I want to see a CI pipeline with coverage, architecture and dependency checks,
  so that I can trust the code quality claims without running anything.
- As the site owner, I want dependency upgrades proposed automatically,
  so that pinned versions do not go stale or vulnerable.

## Acceptance criteria (EARS)

### Repository root
- REQ-REPO-001 THE repository SHALL contain `apps/web` (Angular) and `apps/api` (Spring Boot) as independent projects, each buildable on its own.
- REQ-REPO-002 THE repository root SHALL provide a `package.json` with scripts that run each app's lint, format check, typecheck, test and build, without npm workspaces or a monorepo build tool.
- REQ-REPO-003 THE repository SHALL pin the Node and Java versions in files read by both local tooling and CI (e.g. `.nvmrc`, `engines`, Maven toolchain / `maven.compiler.release`).
- REQ-REPO-004 THE repository SHALL include an `.editorconfig` and `.gitattributes` that fix line endings to LF for source files, so Windows and Linux produce identical diffs.
- REQ-REPO-005 WHEN `node --test` runs over `.claude/hooks`, THE hook test suite SHALL pass, covering at least the guard-bash block/allow cases and protect-secrets.

### Web (`apps/web`)
- REQ-WEB-001 THE web app SHALL be an Angular standalone, zoneless application with SSG prerendering enabled.
- REQ-WEB-002 WHEN `npm run build` runs, THE web app SHALL prerender a placeholder home route to static HTML.
- REQ-WEB-003 THE web app SHALL provide `dev`, `test`, `e2e`, `lint`, `typecheck` and `build` npm scripts (as listed in CLAUDE.md). `e2e` may be a stub that exits 0 until spec 004.
- REQ-WEB-004 WHEN `npm run test` runs, THE web app SHALL execute Vitest with line coverage and fail if coverage is below 80%.
- REQ-WEB-005 WHEN `npm run lint` runs, THE web app SHALL run ESLint (angular-eslint) and a Prettier check, failing on any error or unformatted file.
- REQ-WEB-006 THE web app SHALL pin every dependency to an exact version (no `^` or `~`) and commit `package-lock.json`.

### API (`apps/api`)
- REQ-API-001 THE api SHALL be a Spring Boot 4 application on Java 25, built with Maven through a committed Maven wrapper (`mvnw`, `mvnw.cmd`).
- REQ-API-002 WHEN `GET /actuator/health` is called, THE api SHALL return HTTP 200 with status `UP`, and SHALL expose no other actuator endpoint over HTTP.
- REQ-API-003 WHEN `./mvnw verify` runs, THE api SHALL run unit and integration tests and fail if JaCoCo line coverage is below 85%.
- REQ-API-004 WHEN `./mvnw verify` runs, THE api SHALL fail if any file deviates from palantir-java-format (Spotless check).
- REQ-API-005 THE api SHALL contain an ArchUnit test that fails WHEN a class in a `..domain..` package depends on Spring, Jakarta or any `..adapter..` package.
- REQ-API-006 THE api SHALL declare every dependency and plugin version explicitly (via the Spring Boot BOM or exact versions), with no version ranges.

### CI (GitHub Actions)
- REQ-CI-001 WHEN a pull request targets `develop` or `main`, THE CI workflow SHALL run lint, format check, typecheck, tests with coverage gates, and build for both apps, plus the hook tests.
- REQ-CI-002 WHEN a pull request changes only files under one app, THE CI workflow SHALL still report every required check (skipped jobs report success), so branch protection can require fixed check names.
- REQ-CI-003 IF any check fails, THEN THE workflow SHALL fail the PR with the failing job named.
- REQ-CI-004 THE CI workflow SHALL pin every third-party Action by full commit SHA, with the version in a trailing comment.
- REQ-CI-005 THE CI workflow SHALL run with least-privilege `permissions` (default `contents: read`) and SHALL NOT use `pull_request_target`.
- REQ-CI-006 WHEN CI runs, THE workflow SHALL scan dependencies for known vulnerabilities and fail on any high or critical finding: `npm audit --audit-level=high` for web, and a key-free scanner (e.g. OSV-Scanner) over the Maven dependencies for api. No API keys or secrets.
- REQ-CI-007 THE CI workflow SHALL cache npm and Maven dependencies keyed on lockfile / `pom.xml` hashes.
- REQ-CI-008 THE repository SHALL include a Renovate configuration that proposes upgrades for npm, Maven and GitHub Actions (SHA digests), grouped and scheduled weekly, with no automerge.
- REQ-CI-009 WHEN a push lands on `develop` or `main`, THE CI workflow SHALL run the same checks as on PRs.
- REQ-CI-010 WHEN CI runs, THE hook tests SHALL run on both `ubuntu-latest` and `windows-latest`, since the owner develops on Windows 11. All other jobs run on `ubuntu-latest`.

## Non-functional
- **Speed:** a full CI run on a warm cache completes in ≤10 minutes.
- **Parity:** every CI step is a script the developer can run locally on Windows 11 with the same result; no CI-only logic.
- **Security:** no secrets are needed for CI in this spec; workflows read no repository secrets.
- **Supply chain:** exact version pins everywhere (constitution 7.3); Actions pinned by SHA (5.4).
- **Accessibility / performance:** not measured in this spec (placeholder page only); Lighthouse CI and axe arrive with specs 004 and 016.
- **Cost:** zero spend on GitHub. Free plan only, no paid subscription or services (constitution 8).
  Assumes the repo is public before CI lands, which makes standard Actions runners unlimited and free
  and makes branch protection available. If it is still private, CI must stay inside 2,000 free
  minutes per month (Windows minutes count double).

## Out of scope
- Playwright e2e tests, Lighthouse CI, axe checks (spec 004 / 016).
- GraalVM native image build and container image publishing (spec 016).
- Deployment to Cloudflare Pages / Azure Container Apps (spec 016).
- Content loader and content JSON Schema validation (spec 003).
- Design tokens and UI (spec 002).
- PIT mutation testing (added with `lab.domain` in spec 010).
- Applying GitHub branch protection (blocked by repo plan; separate decision). This spec only makes the check names stable so protection can require them.

## Open questions
- Repo visibility: the plan assumes it goes public before CI lands (see Cost). Before that: move the
  notice-period line out of `docs/brief.md` into `docs/private/`, and scan history for secrets.
  Resolved 2026-11-17: Windows job for hook tests (REQ-CI-010); `npm audit` for web plus a key-free
  scanner for Java (REQ-CI-006); zero GitHub spend.

Status: APPROVED (2026-11-17)
