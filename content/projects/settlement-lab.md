---
id: settlement-lab
published: true
featured: true
order: 10
updated: 2026-11-19
title: Settlement Lab
tagline: A settlement engine that never creates or loses money, even under concurrency, duplicates and failures.
status: In progress
stack: [Java 25, virtual threads, Resilience4j, jqwik, JUnit 5, ArchUnit]
repo: https://github.com/TheSiddheshFulawade/settlement-lab
---

> Original work, built in public. It uses no employer design, naming, code or data.

## The problem

Move money between accounts concurrently without ever creating or losing a single unit, even when
the same transfer arrives twice, the downstream general ledger is slow or failing, and load exceeds
capacity. Then measure how different locking and threading choices behave under the same load.

## Design

- **Ledger in two modes.** Ordered locking takes per-account locks in ascending account order, so
  opposing transfers cannot deadlock. A lock-free CAS mode swaps an immutable snapshot atomically, for comparison.
- **Idempotency.** The first delivery of a transfer id does the work; concurrent duplicates wait for
  and receive the same outcome. The effect is exactly once.
- **Backpressure.** A bounded queue rejects new work with a clear `QUEUE_FULL` instead of growing
  without limit. Workers run on platform threads or virtual threads with the same concurrency cap.
- **Resilience.** Postings are published to a fake general ledger that injects latency, errors,
  timeouts, duplicate acknowledgements and outages. Retry with jitter and a circuit breaker protect
  it; anything that cannot be delivered waits in an outbox.
- **Invariants as tests.** jqwik property tests and concurrency stress tests check that total money
  is conserved, no balance goes negative, nothing is posted twice and the general ledger matches the ledger.

## Decisions and trade-offs

| Decision                        | Why                                                               | Cost                                               |
| ------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------- |
| Ordered locking as the default  | Simple to reason about, no deadlocks by construction              | Hot accounts serialise                             |
| CAS snapshot as the alternative | Atomic across both accounts without locks                         | Copy on every write, retry storms under contention |
| Outbox for the general ledger   | The ledger stays the source of truth while the downstream is down | Eventual, not immediate, consistency               |
| Engine free of any framework    | The v2 Spring Boot API wraps it without changing it               | A little more wiring code                          |

## Results

Results coming. The runner prints a table for each combination of ledger mode, thread model and
fault profile (throughput, p50 and p99 latency, retries, breaker opens, invariants), and the
numbers will appear here with the machine and JDK they were measured on.

## What comes next

A Spring Boot API and a live dashboard on this site, where you can run scenarios and watch the
invariants hold in real time.
