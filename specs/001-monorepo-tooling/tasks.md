# 001 · Monorepo and tooling · Tasks

Each task: half a day or less, test written first, build green afterwards.
Tags: [web] [api] [content] [infra]

Conventions for every task:
- Branch `feature/001-T<NN>` from `develop`. One task per session. Add one line to `CHANGELOG.md`
  under Unreleased (every task touches `CHANGELOG.md`, so it is not repeated in the file lists).
- "test first" is committed with the task and must fail before the implementation. Where a task adds
  tests for code that already exists (T-04), the failing-first proof is a local mutation that is
  never committed. Where a gate cannot be unit-tested (coverage, format, lint thresholds), the task
  also records a one-off negative proof in its PR description.
- "Build green" after a task means: `npm run test:hooks`, `test:scripts` and `check:repo` pass, plus
  the root scripts of every app that exists at that point. The aggregate `npm run verify` becomes
  green once T-15 has landed (it calls `audit:api`); it is not a per-task gate before that.
- "(verify)" items from design.md are done criteria: confirm the current version or option name
  against official docs or the release page, pin it exactly, and note the source in the PR.
- Repo policy checks live in `scripts/checks/<name>.mjs`, each exporting `check(root): string[]`.
  Tests call `check()` on small fixture trees in a temp dir, so they need no real app. `npm run
  check:repo` runs every module against the real repo. The runner discovers modules by file name,
  so parallel tasks never edit a shared registry.
- File ownership is split so the `[web]` and `[api]` tracks touch disjoint files (see "Parallel
  tracks"). The root `package.json` script contract is written once, in T-02.
- Deviations from the design's test file names, for that reason (test names are unchanged):
  the REQ-WEB-006 pin tests and the `.nvmrc` ↔ `engines` test live in `web-config.test.mjs`; the
  REQ-API-006 pom pin test and the `.sdkmanrc` ↔ `java.version` test live in `api-build.test.mjs`;
  the REQ-REPO-001 layout tests are split across the same two files; the "workflow uses
  node-version-file and java-version-file" test lives in `workflow.test.mjs`. `toolchain.test.mjs`
  keeps the `.nvmrc` exactness test. There is no `pins.test.mjs` or `layout.test.mjs`.

## Tasks

- [x] T-01 [infra] Review tooling diffs against `develop`
      depends on: none
      files: `.claude/skills/review/SKILL.md`, `.claude/agents/security-auditor.md`
      test first: one-off check `rg -n "main\.\.\.HEAD|against main" .claude/skills/review .claude/agents`
      returns three matches today (review skill lines 7 and 9, security-auditor line 11). It must return none afterwards.
      covers: none directly (process hygiene for constitution 1.6; every later task's `/review` depends on it)
      done when:
      - The review skill says "Review the current branch against develop" and gets the diff with
        `git fetch origin develop` then `git diff origin/develop...HEAD --stat` (remote ref, so a
        stale local `develop` in a worktree cannot widen the diff).
      - The skill states the one exception: on a `release/*` branch or a PR into `main`, diff against `origin/main`.
      - `security-auditor.md` uses the same base.
      - The one-off check above returns no matches.

- [x] T-02 [infra] Root script contract, check runner and Maven runner
      depends on: none
      files: `package.json` (root), `scripts/check-repo.mjs`, `scripts/check-repo.test.mjs`,
      `scripts/checks/scripts-contract.mjs`, `scripts/checks/scripts-contract.test.mjs`,
      `scripts/mvnw.mjs`, `scripts/mvnw.test.mjs`
      test first:
      - `scripts-contract.test.mjs`: `REQ-REPO-002 root package.json defines lint, format:check, typecheck, test, build for web and api`,
        `REQ-REPO-002 root package.json has no dependencies or workspaces` (fixtures: a good manifest, one with `workspaces`, one with `dependencies`, one missing `typecheck:api`).
      - `check-repo.test.mjs`: discovers every `scripts/checks/*.mjs` except `*.test.mjs`, prints each
        error prefixed with the module name, exits 1 on any error and 0 on none.
      - `mvnw.test.mjs`: pure `buildSpawn(platform, args)` returns, on `win32`, the single command string
        `.\mvnw.cmd <args joined by spaces>` with `shell: true` and no args array, and elsewhere `./mvnw`
        with the args array and no shell, cwd `apps/api` in both; the CLI forwards arguments and the child exit code.
      - `mvnw.test.mjs` (allow-list, design "Maven runner argument allow-list"): pure `validateArgs(args)`.
        `REQ-REPO-002 mvnw accepts every argument in the root script contract`; `REQ-REPO-002 mvnw rejects <char>`,
        one case each for `%`, `^`, `&`, `|`, `<`, `>`, `"`, `'`, `!`, `(`, `)`, `;`, backtick, space, tab, CR, LF,
        a non-ASCII character and the empty string; `REQ-REPO-002 mvnw spawns nothing and exits 2 on a rejected argument`
        (CLI run with an injected spawn stub, or a canary file that a successful spawn would create, asserted absent).
      covers: REQ-REPO-002
      done when:
      - Root `package.json` is `private: true`, has no `dependencies`, `devDependencies`, `workspaces`
        or lockfile, and defines every script in the design's root script contract except
        `install:renovate` and `check:renovate` (added in T-16). App scripts may fail until their app exists; nothing runs
        them before T-18.
      - `test:hooks` and `test:scripts` use escaped double-quoted globs (`node --test \".claude/hooks/*.test.mjs\"`)
        so Node expands them on both cmd.exe and sh.
      - `scripts/mvnw.mjs` spawns `.\mvnw.cmd` with `shell: true` on Windows (Node refuses to spawn
        `.cmd` files without a shell since the CVE-2024-27980 fix), as one command string, so Node 24
        prints no DEP0190 warning (checked: a run on Windows 11 shows no `DEP0190` in stderr). Every forwarded argument passes
        `validateArgs` on every platform before any spawn. A rejection prints
        `mvnw.mjs: rejected argument <JSON-escaped arg>` to stderr and exits 2. The executable and cwd are constants.
      - `npm run test:scripts` and `npm run check:repo` pass on Windows 11.

- [x] T-03 [infra] Line endings, editor rules and Node pin
      depends on: T-02
      files: `.gitattributes`, `.editorconfig`, `.gitignore`, `.nvmrc`,
      `scripts/checks/line-endings.mjs`, `scripts/checks/line-endings.test.mjs`,
      `scripts/checks/toolchain.mjs`, `scripts/checks/toolchain.test.mjs`
      test first:
      - `line-endings.test.mjs`: `REQ-REPO-004 .gitattributes forces LF and CRLF only for cmd/bat`,
        `REQ-REPO-004 no tracked text file has CRLF in the index (git ls-files --eol)`,
        `REQ-REPO-004 mvnw is tracked as 100755`. The index rules run on parsed
        `git ls-files -s --eol` lines (a pure function), so fixtures are plain strings. The mode rule
        applies to every tracked file named `mvnw` or `*.sh` and is vacuously true until T-09 adds the wrapper.
      - `toolchain.test.mjs`: `REQ-REPO-003 .nvmrc is an exact 24.x version >= 24.15.0` (rejects `24`, `lts/*`, `v24`, `26.0.0`).
      covers: REQ-REPO-004, REQ-REPO-003 (Node pin)
      done when:
      - `.gitattributes` adds `mvnw text eol=lf`, `*.sh text eol=lf` and binary rules for
        `*.jar *.ico *.gif *.jpeg *.webp *.avif *.ttf *.woff`, keeping the existing rules.
      - `.editorconfig` adds `[*.xml] indent_size = 4`. `.gitignore` adds `.cache/`.
      - `.nvmrc` holds Node 24 LTS at the latest patch (Q-3). (verify) the patch on nodejs.org; it must be ≥ 24.15.0.
      - `git add --renormalize .` produces no change (or the change is committed in this task).
      - `npm run check:repo` and `npm run test:scripts` pass.

- [ ] T-04 [infra] Hook test suite
      depends on: T-02
      files: `.claude/hooks/_spawn-hook.mjs`, `.claude/hooks/guard-bash.test.mjs`,
      `.claude/hooks/protect-secrets.test.mjs`, `.claude/hooks/lib.test.mjs`,
      `.claude/hooks/quality-gate.test.mjs`; a hook source file only if a test exposes a real defect
      test first: the test cases listed for REQ-REPO-005 in design.md (guard-bash 13 cases,
      protect-secrets 5, lib 1, quality-gate 1), all prefixed `REQ-REPO-005`. They test existing hooks,
      so the failing-first proof is local: invert one guard-bash rule and one protect-secrets rule, see
      the matching tests fail, then restore (not committed).
      covers: REQ-REPO-005
      done when:
      - `_spawn-hook.mjs` spawns a hook with `process.execPath` (no shell), pipes the JSON payload to
        stdin, and returns `{ code, stderr }`. Tests assert exit 0 (allow) or 2 (block) and the stderr reason.
      - Windows backslash paths are exercised in protect-secrets and lib tests.
      - `npm run test:hooks` passes on Windows 11 (and in WSL or Linux if available; CI proves both from T-18).
      - If a test exposes a defect, the hook fix is in this task and named in the PR description.
        A defect that needs more than a small fix is raised with the user instead.

- [x] T-05 [web] Angular 22 static, zoneless skeleton with exact pins
      depends on: T-02, T-03
      files: `apps/web/package.json`, `apps/web/package-lock.json`, `apps/web/.npmrc`,
      `apps/web/angular.json`, `apps/web/tsconfig.json`, `apps/web/tsconfig.app.json`,
      `apps/web/tsconfig.spec.json`, `apps/web/src/main.ts`, `apps/web/src/main.server.ts`,
      `apps/web/src/index.html`, `apps/web/src/styles.scss`, `apps/web/src/app/app.component.ts`,
      `apps/web/src/app/app.config.ts`, `apps/web/src/app/app.config.server.ts`,
      `apps/web/src/app/app.routes.ts`, `apps/web/src/app/app.routes.server.ts`,
      `apps/web/src/app/app.config.spec.ts`, `apps/web/public/favicon.ico`,
      `scripts/checks/web-config.mjs`, `scripts/checks/web-config.test.mjs`; delete `apps/.gitkeep` if present
      test first:
      - `web-config.test.mjs`: `REQ-WEB-001 zone.js absent, outputMode static, server routes prerender`,
        `REQ-WEB-006 no ^ or ~ in dependencies, devDependencies, optionalDependencies, overrides`,
        `REQ-WEB-006 package-lock.json is committed`, `REQ-REPO-001 web is an independent project (own package.json and lockfile)`,
        `REQ-REPO-003 .nvmrc satisfies apps/web engines.node`. Fails today because `apps/web` does not exist.
      - `app.config.spec.ts`: `REQ-WEB-001 app runs without Zone.js` (`globalThis.Zone` is undefined and the app boots in TestBed).
      covers: REQ-WEB-001, REQ-WEB-006, REQ-REPO-001 (web), REQ-REPO-003 (engines)
      done when:
      - Generated with the Angular CLI at the pinned version (`ng new` with SSR, zoneless, SCSS,
        routing, prefix `sf`, Vitest, `--skip-git`), then trimmed: no `server.ts`, no `express`, no
        `ssr.entry`, no `polyfills`, `outputMode: "static"`, server routes `{ path: '**', renderMode: RenderMode.Prerender }`.
        The CLI's nested `.editorconfig`, `README.md` and `.vscode/` are removed (root files apply).
      - Component schematics set `type: "component"` and `changeDetection: "OnPush"`. `tsconfig` has `strict` and `strictTemplates`.
      - `index.html` has `lang="en"` and a neutral `<title>`. The Q-1 scaffold exception covers this
        `<title>` (user decision 2026-11-18); it carries the comment
        `<!-- Scaffold exception (spec 001, Q-1): title set from content/ by spec 004/005. -->`.
      - Runtime `dependencies` are exactly the ADR-0001 set; `npm ls zone.js express` finds nothing.
      - `.npmrc` sets `save-exact=true` and `engine-strict=true`; `engines.node` is `">=24.15.0 <25.0.0"`.
      - (verify) Angular / CLI / `@angular/build` / `@angular/ssr` 22.x latest patch; TypeScript 6.0.x
        within `>=6.0.0 <6.1.0`; the Vitest, `@vitest/coverage-v8` and jsdom versions `@angular/build` 22 requires.
      - From the root: `npm run install:web`, `typecheck:web`, `test:web`, `build:web` and `audit:web` exit 0;
        `check:repo` passes. If `audit:web` reports a high finding in dev tooling, follow risk R-4 (never lower the level).

- [x] T-06 [web] ESLint (angular-eslint) and Prettier gate
      depends on: T-05
      files: `apps/web/eslint.config.js`, `apps/web/.prettierrc.json`, `apps/web/.prettierignore`,
      `apps/web/package.json`, `apps/web/package-lock.json`, `apps/web/angular.json` (lint target),
      `scripts/checks/web-config.mjs`, `scripts/checks/web-config.test.mjs`; any `apps/web` file reformatted
      test first: `web-config.test.mjs`: `REQ-WEB-005 lint script runs ng lint then prettier --check`,
      `REQ-WEB-005 eslint config enables tsRecommended, templateRecommended, templateAccessibility, prefix sf and OnPush`.
      covers: REQ-WEB-005
      done when:
      - `lint` = `ng lint && prettier --check .`; `format` and `format:check` scripts exist; Prettier uses `endOfLine: "lf"` and ignores `dist`, `coverage`, `.angular`.
      - (verify) angular-eslint 22.x matching the Angular major; the typescript-eslint and ESLint majors
        it pins and their TypeScript 6.0 support (risk R-3: an "unsupported TS" warning is tolerated only if lint passes); Prettier 3.x latest.
      - Negative proof in the PR: an unformatted file and an ESLint error (for example a component
        selector without the `sf` prefix) each make `npm run lint` exit non-zero; both reverted.
      - From the root: `npm run lint:web` and `format:check:web` exit 0; `check:repo` passes.

- [x] T-07 [web] Web script set, 80 % coverage gate and e2e stub
      depends on: T-06
      files: `apps/web/angular.json` (test target), `apps/web/package.json`, `apps/web/scripts/e2e-stub.mjs`,
      `scripts/checks/web-config.mjs`, `scripts/checks/web-config.test.mjs`
      test first: `web-config.test.mjs`: `REQ-WEB-003 web defines dev, test, e2e, lint, typecheck, build`,
      `REQ-WEB-003 e2e stub exits 0` (spawns the stub with `process.execPath`),
      `REQ-WEB-004 angular.json test target sets lines threshold 80`.
      covers: REQ-WEB-003, REQ-WEB-004
      done when:
      - The test target uses `@angular/build:unit-test` with `runner: vitest`, a line coverage threshold of 80
        and reporters `text-summary` and `lcov`. `test` = `ng test --no-watch --coverage`.
      - `dev` = `ng serve`; `typecheck` runs `tsc --noEmit` for `tsconfig.app.json` and `tsconfig.spec.json`;
        `e2e` runs the stub, which prints "e2e: no tests until spec 004" and exits 0.
      - (verify) the exact option name for coverage thresholds in `@angular/build:unit-test` 22 (design: `coverageThresholds.lines`).
      - Negative proof in the PR: an untested component pushes line coverage below 80 % and `npm run test` exits non-zero; reverted.
      - From the root: `npm run test:web` exits 0; `check:repo` passes.

- [ ] T-08 [web] Placeholder home route and prerender verification
      depends on: T-07
      files: `apps/web/src/app/features/home/home-page.component.ts`, `.html`, `.scss`, `.spec.ts`,
      `apps/web/src/app/app.routes.ts`, `apps/web/src/app/app.routes.spec.ts`,
      `apps/web/scripts/verify-prerender.mjs`, `apps/web/package.json` (`postbuild`, Testing Library dev dependency),
      `apps/web/package-lock.json`
      test first:
      - `home-page.component.spec.ts`: `REQ-WEB-002 home route renders the placeholder heading`
        (Testing Library `getByRole('heading', { level: 1 })`; asserts the role and level, not the text).
      - `app.routes.spec.ts`: `REQ-WEB-002 '' route resolves to HomePageComponent`.
      covers: REQ-WEB-002, REQ-WEB-001 (prerender output)
      done when:
      - `sf-home-page` renders one `<main>` with one `<h1>`. Its text is neutral scaffold text with no
        personal or employer content.
      - Q-1 scaffold exception: the hard-coded text lives only in `home-page.component.html` (and the
        `index.html` `<title>` from T-05). The component template carries the comment `<!-- Scaffold exception (spec 001, Q-1): replaced by spec 005, which reads content/. -->`.
        No other component holds literal copy. The PR description records the exception and its expiry (spec 005).
      - `verify-prerender.mjs` runs as `postbuild` and fails the build unless the browser `index.html`
        exists, contains the `<h1>` inside `sf-root`, and no `server.mjs` was emitted.
        (verify) the output path (design: `dist/web/browser/index.html`).
      - (verify) the `@testing-library/angular` version that supports Angular 22; exact pin.
      - Negative proof in the PR: removing the `<h1>` makes `npm run build` exit non-zero; reverted.
      - From the root: `npm run lint:web`, `typecheck:web`, `test:web` (≥ 80 % lines), `build:web` exit 0.

- [ ] T-09 [api] Maven wrapper, pom baseline, Java pin and bootstrap class
      depends on: T-02, T-03
      files: `apps/api/mvnw`, `apps/api/mvnw.cmd`, `apps/api/.mvn/wrapper/maven-wrapper.properties`,
      `apps/api/pom.xml`, `apps/api/src/main/java/dev/sf/portfolio/PortfolioApplication.java`,
      `.sdkmanrc`, `scripts/checks/api-build.mjs`, `scripts/checks/api-build.test.mjs`; delete `apps/.gitkeep` if present
      test first: `api-build.test.mjs`: `REQ-API-001 wrapper scripts and properties with distributionSha256Sum exist`,
      `REQ-API-001 parent is spring-boot-starter-parent 4.x and java.version is 25`,
      `REQ-API-006 pom has no version ranges, LATEST or RELEASE`,
      `REQ-REPO-001 api is an independent project (own pom and wrapper)`,
      `REQ-REPO-003 .sdkmanrc java major equals pom java.version`. Fails today because `apps/api` does not exist.
      covers: REQ-API-001, REQ-API-006, REQ-REPO-001 (api), REQ-REPO-003 (Java pin)
      done when:
      - Wrapper type `only-script` (no jar committed) with `distributionSha256Sum`.
      - `mvnw` is committed with the executable bit: `git update-index --chmod=+x apps/api/mvnw`, and
        `git ls-files -s apps/api/mvnw` shows `100755`. After `git add` and before the chmod (Windows
        stages it as `100644`), `npm run check:repo` fails on the T-03 mode rule; that is the rule's first real failure.
      - `pom.xml`: parent `spring-boot-starter-parent` 4.x exact; `java.version` 25; `spring-boot-starter-webmvc`
        and `spring-boot-starter-actuator`; `spring-boot-starter-test` plus the Boot 4 RestTestClient test
        starter (test scope); maven-enforcer (`requireJavaVersion 25`, `requireMavenVersion 3.9`,
        `requirePluginVersions`, `banDynamicVersions`); compiler `-Xlint:all,-processing` with `failOnWarning`;
        surefire (`*Test`) and failsafe (`*IT`) with explicit versions or versions from the parent.
      - `PortfolioApplication` is a bare `@SpringBootApplication`.
      - (verify) Temurin 25 latest patch and its SDKMAN identifier (`java=25.0.N-tem`); Spring Boot 4.x latest
        GA patch; Maven 3.9.x latest; Maven Wrapper 3.3.x; the RestTestClient test starter name (risk R-8,
        fallback `TestRestTemplate` with `@AutoConfigureTestRestTemplate`).
      - Negative proof in the PR: a temporary version range (`[1.0,)`) makes the enforcer fail; reverted.
      - From the root on Windows 11: `npm run lint:api`, `typecheck:api`, `build:api` and `test:api` exit 0; `check:repo` passes.

- [ ] T-10 [api] Health-only actuator exposure
      depends on: T-09
      files: `apps/api/src/main/resources/application.yaml`,
      `apps/api/src/test/java/dev/sf/portfolio/HealthEndpointIT.java`, `apps/api/pom.xml` (only if the test starter changes)
      test first: `HealthEndpointIT` (`@SpringBootTest(webEnvironment = RANDOM_PORT, useMainMethod = ALWAYS)`,
      `@AutoConfigureRestTestClient`): `REQ-API-002 health returns 200 with status UP`,
      `REQ-API-002 health hides details and components`, `REQ-API-002 other actuator endpoints return 404`
      (`/actuator`, `/actuator/info`, `/actuator/env`, `/actuator/beans`, `/actuator/metrics`).
      The 404 case for `/actuator` fails before the config, because Boot exposes discovery by default.
      covers: REQ-API-002
      done when:
      - `application.yaml` sets `management.endpoints.web.exposure.include: health`,
        `management.endpoints.web.discovery.enabled: false`, `management.endpoint.health.show-details: never`,
        `show-components: never`, and, if the property exists in Boot 4, `management.endpoints.access.default: none`
        with health `read-only`. (verify) every property name against the Boot 4 reference.
      - The health response body is exactly `{"status":"UP"}` with the actuator v3 media type.
      - From the root: `npm run test:api` exits 0 and runs the IT through failsafe.

- [ ] T-11 [api] JaCoCo merged line coverage gate at 85 %
      depends on: T-10
      files: `apps/api/pom.xml`, `scripts/checks/api-build.mjs`, `scripts/checks/api-build.test.mjs`
      test first: `api-build.test.mjs`: `REQ-API-003 jacoco check enforces LINE COVEREDRATIO 0.85 on the merged data at verify`.
      covers: REQ-API-003
      done when:
      - JaCoCo executions: `prepare-agent`, `prepare-agent-integration`, `merge`, `report`, `check`
        (LINE COVEREDRATIO ≥ 0.85 on the merged exec), all bound so they run in `verify`. Failsafe is
        declared before JaCoCo so the merge sees the IT data. Surefire and failsafe use `@{argLine}` so the agent attaches.
      - `PortfolioApplication` is covered through `useMainMethod = ALWAYS`; no JaCoCo exclusions.
      - (verify) JaCoCo 0.8.15 or later (Java 25 support).
      - Negative proof in the PR: an untested class makes `npm run test:api` fail on the coverage check; reverted.
      - From the root: `npm run test:api` exits 0; `check:repo` passes.

- [ ] T-12 [api] Spotless with palantir-java-format, and formatter docs (Q-2)
      depends on: T-11
      files: `apps/api/pom.xml`, `apps/api/.mvn/jvm.config` (only if risk R-2 needs exports), every
      Java file under `apps/api/src` (reformatted), `scripts/checks/api-build.mjs`,
      `scripts/checks/api-build.test.mjs`, `.claude/skills/spring-standards/SKILL.md`, `.claude/hooks/format.mjs` (comment only)
      test first: `api-build.test.mjs`: `REQ-API-004 spotless uses palantirJavaFormat with removeUnusedImports and check runs at verify`.
      covers: REQ-API-004
      done when:
      - Spotless `palantirJavaFormat` and `removeUnusedImports`, `check` bound to `verify`. `npm run format:api` applies it.
      - (verify) Spotless Maven plugin 3.x latest and palantir-java-format latest 2.x, and that it formats
        Java 25 syntax on JDK 25 (risk R-2: add `.mvn/jvm.config` exports first; switching formatter needs the user's approval).
      - Q-2: `spring-standards/SKILL.md` says "Spotless (palantir-java-format)"; the `format.mjs` comment says
        "palantir-java-format" with no behaviour change. `rg -n google-java-format .claude` returns nothing.
      - Negative proof in the PR: a misformatted Java file makes both `npm run format:check:api` and `npm run test:api` fail; reverted.
      - From the root: `npm run format:check:api` and `test:api` exit 0; `npm run test:hooks` still passes.

- [ ] T-13 [api] ArchUnit rule: domain is framework-free
      depends on: T-12
      files: `apps/api/pom.xml` (`archunit-junit5`, test scope),
      `apps/api/src/test/java/dev/sf/portfolio/architecture/ArchitectureRules.java`,
      `.../architecture/ArchitectureTest.java`, `.../architecture/ArchitectureRuleSelfTest.java`,
      `.../architecture/fixture/domain/*.java`, `.../architecture/fixture/adapters/*.java`
      test first: `ArchitectureRuleSelfTest`: `REQ-API-005 rule reports a domain class that imports Spring`,
      `REQ-API-005 rule reports a domain class that uses an adapters class` (imports only the fixture classes
      with `ClassFileImporter` and asserts the rule reports violations). Fails before `ArchitectureRules` exists.
      covers: REQ-API-005
      done when:
      - `DOMAIN_IS_FRAMEWORK_FREE` matches the design: `..domain..` must not depend on
        `org.springframework..`, `jakarta..`, `com.fasterxml.jackson..`, `tools.jackson..`, `..adapter..`, `..adapters..`.
      - `ArchitectureTest` (`REQ-API-005 domain does not depend on Spring, Jakarta, Jackson or adapters`) uses
        `@AnalyzeClasses(packages = "dev.sf.portfolio", importOptions = DoNotIncludeTests.class)` and
        `allowEmptyShould(true)` until spec 010, so the fixtures never reach the real rule run.
      - (verify) ArchUnit 1.5.x latest patch reads Java 25 class files (major 69).
      - From the root: `npm run test:api` exits 0 with coverage still ≥ 85 %.

- [ ] T-14 [infra] OSV severity gate (pure logic)
      depends on: T-02
      files: `scripts/lib/osv-gate.mjs`, `scripts/lib/osv-gate.test.mjs`, `scripts/lib/fixtures/osv-*.json`
      test first: `osv-gate.test.mjs`: `REQ-CI-006 CVSS 7.0 fails`, `REQ-CI-006 CVSS 6.9 passes`,
      `REQ-CI-006 missing severity fails`, `REQ-CI-006 ignored id with reason passes`,
      `REQ-CI-006 exit 128 fails closed` (and any exit other than 0 and 1), using fixture JSON shaped like
      OSV `results[].packages[].groups[].max_severity`.
      covers: REQ-CI-006 (api gate logic)
      done when:
      - `evaluate(json, ignores)` returns findings to fail with id, package, version and score;
        `interpretExit(code)` fails closed on tool errors. No I/O in this module.
      - `npm run test:scripts` passes.

- [ ] T-15 [infra] OSV runner: pinned binary, checksum and scan
      depends on: T-14, T-09
      files: `scripts/osv-scan.mjs`, `scripts/osv-scan.test.mjs`, `tools/osv-scanner.json`,
      `apps/api/osv-scanner.toml`, `scripts/checks/osv-config.mjs`, `scripts/checks/osv-config.test.mjs`
      test first:
      - `osv-scan.test.mjs`: `REQ-CI-006 checksum mismatch fails` (injected downloader returning wrong bytes),
        `REQ-CI-006 verified binary is moved into .cache/tools atomically` (temp file then rename), asset chosen per platform.
      - `osv-config.test.mjs`: `REQ-CI-006 an ignore without reason or effectiveUntil fails check:repo`.
      covers: REQ-CI-006
      done when:
      - `tools/osv-scanner.json` holds the version and per-asset file and SHA-256 for `linux_amd64`,
        `windows_amd64`, `darwin_arm64`, plus a `_comment` describing the manual checksum update (risk R-6, ADR-0002).
      - `apps/api/osv-scanner.toml` exists with no ignores.
      - (verify) OSV-Scanner latest v2.x, its release asset names, SHA-256 values from the release checksums
        file, the `scan source --format json` flags, and whether ignores in `osv-scanner.toml` are already
        removed from the JSON output (if so, the gate does not re-parse the toml; the test still holds).
      - From the root: `npm run audit:api` exits 0 on Windows 11 with no API key; a second run reuses the cached binary.

- [ ] T-16 [infra] Renovate configuration and validator
      depends on: T-15
      files: `renovate.json`, `package.json` (root: `install:renovate`, `check:renovate`),
      `tools/renovate/package.json`, `tools/renovate/package-lock.json`, `scripts/checks/renovate.mjs`,
      `scripts/checks/renovate.test.mjs`
      test first: `renovate.test.mjs`: `REQ-CI-008 renovate is weekly, never automerges, pins action digests, targets develop, groups updates`,
      plus `REQ-CI-008 custom managers cover tools/osv-scanner.json`,
      plus `REQ-CI-008 validator is locked in tools/renovate (exact version, lockfile present, no npx in check:renovate)`
      (fixtures: a `^` range, a missing lockfile, a `check:renovate` that uses `npx`).
      covers: REQ-CI-008
      done when:
      - `renovate.json` follows the design: `config:best-practices` and `schedule:weekly`, timezone
        `Asia/Kolkata`, `automerge: false`, `rangeStrategy: "pin"`, label `dependencies`, majors separate and
        labelled `major`, groups `angular`, `web npm non-major`, `api maven non-major`, `github-actions`, `toolchain`.
      - Target branch `develop`. (verify) the current option name (`baseBranchPatterns` or `baseBranches`),
        the SDKMAN manager name, and that `config:best-practices` still includes `helpers:pinGitHubActionDigests`.
      - `tools/renovate/package.json` is `private: true` with one exact `renovate` devDependency, and its
        `package-lock.json` is committed. (verify) the latest Renovate version.
      - `install:renovate` runs `npm --prefix tools/renovate ci --ignore-scripts --no-audit --no-fund`.
        `check:renovate` runs the validator bin from `tools/renovate/node_modules` with `node`, with no `npx`.
        (verify) the bin's path inside the package.
      - R-9: `install:renovate` then `check:renovate` run with `--ignore-scripts` on Windows 11 and exit 0.
        If the validator needs install scripts, stop and bring the choice back to the user.
      - `npm run check:renovate` and `check:repo` exit 0 on Windows 11; the first-run time is noted in the PR.

- [ ] T-17 [infra] CI orchestration scripts: change detection and gate
      depends on: T-02
      files: `scripts/ci/changes.mjs`, `scripts/ci/changes.test.mjs`, `scripts/ci/gate.mjs`, `scripts/ci/gate.test.mjs`
      test first:
      - `changes.test.mjs`: `REQ-CI-002 api-only change skips web`, `REQ-CI-002 docs-only change skips both apps`,
        `REQ-CI-002 root config change runs both`, `REQ-CI-002 non-PR event runs both`, plus `content/**` → web
        and `.claude/hooks/**` → neither app, `renovate.json changed sets renovate=true` (see open point 2), and
        `tools/renovate/** changed sets renovate=true`.
      - `gate.test.mjs` (design "Gate rules"): `REQ-CI-002 skipped app job passes when changes says unchanged`,
        `REQ-CI-002 skipped app job fails when changes says changed`, `REQ-CI-002 skipped app job fails when changes outputs are missing`,
        `REQ-CI-002 skipped always-on job fails`, `REQ-CI-002 empty or invalid NEEDS fails`,
        `REQ-CI-003 gate fails and names each failed or cancelled job`.
      covers: REQ-CI-002, REQ-CI-003
      done when:
      - `classify(paths)` is pure and follows the design's classification list, returning `{ web, api, renovate }`.
        The CLI runs `git diff --name-only HEAD^1 HEAD` only for `pull_request` (every flag is true otherwise),
        writes `web=`, `api=` and `renovate=` to `$GITHUB_OUTPUT` when set and prints them otherwise, and exits 1 if git fails.
      - `gate.mjs` reads `NEEDS` from the environment only (no interpolation), prints a result table and
        applies the design's gate rules, keyed by job id: pure `evaluate(needs)` returns the failing jobs with a reason, and the
        CLI exits 1 if that list is non-empty. `skipped` passes only for `web`/`api` when `changes` succeeded
        and its output for that app is exactly `"false"`.
      - Both CLIs run locally on Windows 11; `npm run test:scripts` passes.

- [ ] T-18 [infra] CI workflow
      depends on: T-04, T-08, T-13, T-15, T-16, T-17
      files: `.github/workflows/ci.yml` (replaces `.github/workflows/.gitkeep`), `scripts/checks/workflow.mjs`,
      `scripts/checks/workflow.test.mjs`
      test first: `workflow.test.mjs` (line-based rules over fixture YAML strings):
      `REQ-CI-001 workflow triggers on pull_request to develop and main`,
      `REQ-CI-001 web and api jobs run lint, typecheck, test, build and tooling runs test:hooks`,
      `REQ-CI-001 run steps only call root scripts` (NFR parity),
      `REQ-CI-002 job names match the required check list` (`changes`, `repo`, `tooling (ubuntu-latest)`,
      `tooling (windows-latest)`, `web`, `api`, `deps-web`, `deps-api`, `ci-ok`) and `ci-ok` uses `if: always()` and needs every job,
      `REQ-CI-004 every uses: is pinned to a 40-hex SHA with a version comment`,
      `REQ-CI-005 top-level permissions are contents: read and no job escalates`, `REQ-CI-005 pull_request_target is absent`, `no secrets.* reference`,
      `REQ-CI-007 setup-node caches npm keyed on apps/web/package-lock.json`, `REQ-CI-007 setup-java caches maven keyed on apps/api/pom.xml`,
      `REQ-CI-009 workflow triggers on push to develop and main`,
      `REQ-CI-010 tooling matrix is ubuntu-latest and windows-latest, every other job is ubuntu-latest`,
      `REQ-REPO-003 workflow uses node-version-file and java-version-file`,
      `Q-5 schedule runs weekly on Monday at 03:30 UTC` (`cron: '30 3 * * 1'`).
      covers: REQ-CI-001, REQ-CI-002, REQ-CI-003, REQ-CI-004, REQ-CI-005, REQ-CI-006 (jobs), REQ-CI-007,
      REQ-CI-009, REQ-CI-010, REQ-REPO-003 (CI reads the pins), NFR speed, security, supply chain, cost
      done when:
      - `ci.yml` implements the design's job contract, triggers, concurrency, `timeout-minutes` (10; 15 for api),
        `persist-credentials: false`, no trigger-level `paths:`, and untrusted values passed through `env:`.
        The `repo` job needs `changes` and runs `install:renovate` then `check:renovate` only when
        `needs.changes.outputs.renovate == 'true'`. Its `setup-node` caches npm keyed on `tools/renovate/package-lock.json`.
        `ci-ok` passes `toJSON(needs)` through `env:`, so `changes.outputs` reaches the gate.
      - This is the largest task. If it runs past half a day, split it at the test boundary: land
        `workflow.mjs` with its fixture tests first, then `ci.yml`.
      - Q-5: the `schedule` trigger runs weekly on Monday at 03:30 UTC. Schedules only fire on the default
        branch, so it takes effect once `ci.yml` reaches `main` through a release. (verify) `main` is the repo's default branch.
      - Only `actions/checkout`, `actions/setup-node` and `actions/setup-java` are used. (verify) their current
        majors (design: checkout v7, setup-java v6, setup-node to confirm) and resolve each tag to its commit SHA
        from the official repo; record `# vX.Y.Z` comments.
      - Acceptance on this task's PR, recorded in the PR description: every check name reports; all green;
        a temporary failing commit (for example a broken web test) turns `web` and `ci-ok` red with
        "Failed jobs: web", then is reverted with a new commit (no force push); a second push shows npm and
        Maven cache hits; warm-cache wall time ≤ 10 min.
      - `npm run check:repo` and `test:scripts` pass locally.

- [ ] T-19 [infra] Root commands in CLAUDE.md and docs-only CI acceptance
      depends on: T-18
      files: `CLAUDE.md` (Commands section only)
      test first: one-off check `rg -n "once spec 001 creates it" CLAUDE.md` matches today (stale text); it must not match afterwards.
      covers: REQ-CI-002 (acceptance: docs-only PR), NFR parity (documented local commands)
      done when:
      - The Commands section lists the root entry points (`npm run verify`, `lint`, `typecheck`, `test`,
        `build`, `audit`, `check:repo`, `test:hooks`) and the per-app commands, and says CI runs the same scripts.
        No other section of CLAUDE.md changes.
      - Acceptance on this PR, recorded in the description: `web` and `api` report skipped, every other check
        runs, and `ci-ok` is green.

## Parallel tracks (separate worktrees)
- Start: T-01 and T-02 have no dependencies and can run together. T-03 follows T-02.
- After T-02: T-04, T-14 and T-17 can each run in their own worktree (disjoint files).
- After T-03: the web track (T-05 → T-06 → T-07 → T-08) and the api track (T-09 → T-10 → T-11 → T-12 → T-13)
  run in parallel. Within a track tasks are sequential because they share `package.json` / `angular.json` or `pom.xml`.
- After T-09 and T-14: T-15, then T-16 (infra track).
- T-18 joins all tracks; T-19 is last.
- Shared files: only `CHANGELOG.md` (one line per task, trivial conflicts at merge). Each track owns its
  own `scripts/checks/*.mjs` modules (`web-config` for web; `api-build` for api), so no check module is
  edited by two tracks.

## After merge (user actions)
- Install the Mend Renovate GitHub App on the repo (free for public repos) (Q-4).
- Enable Dependabot alerts (free) (Q-4).
- Require the `ci-ok` check in branch protection on `develop` and `main` (Q-7), once T-18 has merged.
- Done 2026-11-17: repo made public; notice period removed from the current brief (PR #3; it stays in
  earlier history by decision, 2026-11-18); history scanned,
  no secrets found; base branch protection applied to `main` and `develop`.

## Coverage (REQ id → tasks)
| REQ id | Tasks |
|---|---|
| REQ-REPO-001 | T-05, T-09 |
| REQ-REPO-002 | T-02 |
| REQ-REPO-003 | T-03, T-05, T-09, T-18 |
| REQ-REPO-004 | T-03, T-09 (mvnw mode) |
| REQ-REPO-005 | T-04 |
| REQ-WEB-001 | T-05, T-08 |
| REQ-WEB-002 | T-08 |
| REQ-WEB-003 | T-07 |
| REQ-WEB-004 | T-07 |
| REQ-WEB-005 | T-06 |
| REQ-WEB-006 | T-05 |
| REQ-API-001 | T-09 |
| REQ-API-002 | T-10 |
| REQ-API-003 | T-11 |
| REQ-API-004 | T-12 |
| REQ-API-005 | T-13 |
| REQ-API-006 | T-09 |
| REQ-CI-001 | T-18 |
| REQ-CI-002 | T-17, T-18, T-19 |
| REQ-CI-003 | T-17, T-18 |
| REQ-CI-004 | T-18 |
| REQ-CI-005 | T-18 |
| REQ-CI-006 | T-05 (`audit:web`), T-14, T-15, T-18 |
| REQ-CI-007 | T-18 |
| REQ-CI-008 | T-16 |
| REQ-CI-009 | T-18 |
| REQ-CI-010 | T-18 |
| NFR speed, security, supply chain, cost | T-18 (plus exact pins in T-05, T-09, T-15, T-16) |
| NFR parity | T-02, T-18, T-19 |
| Q-1 placeholder text | T-05 (`<title>`), T-08 |
| Q-2 formatter docs | T-12 |
| Q-3 Node 24 LTS | T-03, T-05 |
| Q-5 weekly Monday CVE run | T-18 |

## Decisions on open points
1. **Q-1 scope. Decided (user, 2026-11-18):** the time-boxed exception also covers the `index.html`
   `<title>` (neutral text), removed when spec 004/005 sets titles from `content/`. Written into T-05 and T-08.
2. **`check:renovate` condition. Decided (user, 2026-11-18): yes.** The design runs it in the `repo` job "if `renovate.json` changed or not a
   PR" but `changes` only outputs `web` and `api`, and `repo` has no `needs`. Resolution (written into T-17 and
   T-18): `classify` also returns `renovate`, and `repo` needs `changes`. That adds about 10 s to `repo` and changes no check name.
3. **T-19 edits `CLAUDE.md`** (Commands section only). **Decided (user, 2026-11-18): yes.** It replaces the stale "once spec 001 creates it"
   text, and as a docs-only PR it demonstrates the skipped-job path for REQ-CI-002. Approving these tasks approves that edit.
4. **T-01 scope. Decided (user, 2026-11-18):** reviews compare against `develop`; `main` is used only
   for release reviews. `.claude/agents/security-auditor.md` also diffs against `main`, so T-01 fixes it
   as well as the review skill.
5. **Security revision (design.md "Revision 2026-11-18"). Approved 2026-11-18 by the user, who delegated the review:** T-02 adds the mvnw
   argument allow-list, T-16 locks the Renovate validator in `tools/renovate/`, T-17 tightens the
   gate's skip rule and tags `tools/renovate/**` as `renovate`, and T-18 wires `install:renovate` and its cache.
   T-01 (done) is unaffected. No task is added or removed, and dependencies are unchanged.

Status: APPROVED (2026-11-18, security revision)
