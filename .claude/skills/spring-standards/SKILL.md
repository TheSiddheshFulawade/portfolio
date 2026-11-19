---
name: spring-standards
description: Java conventions for the settlement-lab repo - Java 25 engine (v1) and its Spring Boot 4 API (v2), packages, concurrency rules, error handling and testing. Load before writing or reviewing Java code.
---
# Java and Spring standards (settlement-lab repo)

Since ADR-0004 this repo has no Java code. These rules apply in `settlement-lab`; the v1 engine package
layout is in `docs/settlement-lab-spec.md` §4, and the engine never imports Spring.

Verify current Spring Boot 4 and library APIs with Context7 before using anything uncertain.

## Packages (hexagonal)
```
dev.sf.portfolio
  lab/      domain, application, adapters/{web, messaging, gl}
  contact/  domain, application, adapters/{web, mail}
  platform/ security, rate limiting, problem details, observability, config
```
- `domain`: plain Java (records, sealed interfaces). No Spring, Jackson or adapter imports.
- `application`: use cases and ports (interfaces). Depends on domain only.
- `adapters`: Spring web, messaging, external clients; implement ports.
- ArchUnit tests enforce these rules.

## Java style
Records for values; sealed types for results (e.g. `PostingResult = Posted | DuplicateIgnored | Rejected`);
`var` only when the type is obvious; no Lombok; constructor injection only; `Optional` only as a return type.
Money: `long` minor units or `BigDecimal` with explicit scale. Never `double`.

## Concurrency rules
- Write the invariant next to the code that protects it.
- Lock ordering: always acquire account locks in ascending id order.
- Never hold a lock across I/O or a blocking call.
- Virtual threads for blocking I/O; bounded executors for CPU-bound work.
- Bounded queues only, with defined behaviour when full (block with timeout, or reject).
- Check and record the idempotency key atomically with the effect.
- Resilience4j: timeout on every external call; circuit breaker + retry with jitter + bulkhead.

## API
- Jakarta Validation on request records; body size limits; fail on unknown JSON properties.
- Errors: RFC 9457 `ProblemDetail`. Never expose stack traces or library exception messages.
- Bucket4j per-IP limits; a global semaphore for Lab runs.
- Actuator: only `health` is public.
- SSE for live streams.
- OpenAPI 3.1 is the contract (`infra/openapi.yaml`); generated docs must match it.

## Build
Maven wrapper (checksum pinned), Java 25, Spotless (palantir-java-format), JaCoCo ≥85 %, ArchUnit.
Container (v2 only): small JRE base, non-root user.

## Testing
JUnit 5, AssertJ, Mockito (adapters only), jqwik for properties, Awaitility for async,
`@WebMvcTest` slices, WireMock for external HTTP. Test names reference REQ ids.
