# 0001 · Baseline runtime dependencies for apps/web and apps/api

## Status
Accepted (2026-11-17)

## Context
Constitution 7.1 requires an ADR for every new runtime dependency. Spec 001 creates the two app
skeletons, so it introduces the first runtime dependencies in the repo. The stack (Angular SSG,
Spring Boot 4 on Java 25) was chosen in the blueprint and brief. This ADR records the exact set of
runtime packages that the skeletons ship and what was deliberately left out. Constraints: the
initial JS budget is ≤ 120 KB gzipped, the platform is preferred (7.2), every version is an exact
pin (7.3), the site is static (no Node server at runtime), and the API exposes health only.

## Decision
- **apps/web `dependencies`**: `@angular/core`, `@angular/common`, `@angular/compiler`,
  `@angular/platform-browser`, `@angular/router`, `@angular/platform-server`, `@angular/ssr`
  (all 22.x, exact), `rxjs` 7.x and `tslib` 2.x (both exact). `@angular/platform-server` and
  `@angular/ssr` run only at build time for prerendering, but Angular expects them in
  `dependencies`.
- **apps/api runtime**: `spring-boot-starter-webmvc` and `spring-boot-starter-actuator`, with
  versions from the `spring-boot-starter-parent` 4.x BOM (exact parent version).
- **Explicitly excluded**: `zone.js` (zoneless), `express` and `server.ts` (`outputMode: static`,
  no server), `@angular/forms`, `@angular/animations` and UI kits (added by later specs with their
  own ADR if needed), Lombok.

Dev and build tooling (Angular CLI and `@angular/build`, TypeScript, ESLint, angular-eslint,
typescript-eslint, Prettier, Vitest, `@vitest/coverage-v8`, jsdom, Testing Library; Maven plugins:
Spotless + palantir-java-format, JaCoCo, enforcer, surefire and failsafe; test libraries:
spring-boot-starter-test, ArchUnit; CI tools: OSV-Scanner, the Renovate validator) is not a runtime
dependency under 7.1. It is listed in specs/001-monorepo-tooling/design.md and does not need
individual ADRs.

## Alternatives considered
- **Keep the CLI's Express SSR server**: adds a runtime server and dependency that static hosting
  (Cloudflare Pages) does not need.
- **Keep zone.js**: about 30 KB+ raw for no benefit. Zoneless is the Angular 21+ default.
- **Spring Boot `spring-boot-starter-web` (Boot 3 name) or WebFlux**: Boot 4 splits the starters.
  MVC on virtual threads matches the blocking-I/O style in spring-standards. SSE is supported by MVC.

## Consequences
- Positive: smallest runtime surface that still proves SSG and a health check. Every later
  addition is visible as a new ADR.
- Negative: `@angular/ssr` and `@angular/platform-server` sit in `dependencies` even though they
  never reach the browser bundle, which can confuse a reader.
- Revisit if: hosting moves to a server runtime (would bring back an SSR server), or Angular
  changes the packaging of prerendering.

## Links
specs/001-monorepo-tooling (REQ-WEB-001, REQ-WEB-002, REQ-WEB-006, REQ-API-001, REQ-API-002, REQ-API-006) · constitution 7.1–7.3
