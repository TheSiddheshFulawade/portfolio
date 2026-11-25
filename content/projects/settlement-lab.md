---
id: settlement-lab
published: true
featured: true
order: 20
updated: 2026-11-24
title: Settlement Lab
tagline: A transfer engine tested to conserve money under concurrency, duplicates and downstream faults.
status: Engine measured, API built but not deployed
stack:
  [
    Java 21,
    virtual threads,
    Resilience4j,
    jqwik,
    JUnit 5,
    ArchUnit,
    PostgreSQL,
    Spring Boot,
  ]
repo: https://github.com/TheSiddheshFulawade/settlement-lab
---

> Original work, built in public. It uses no employer design, naming, code or data.

## The problem

Move money between accounts concurrently, and check that no unit is created or lost, even when the same transfer
arrives twice, the downstream general ledger is slow or failing, and load exceeds capacity. Then measure how
different locking and threading choices behave under the same load.

"Settlement" here means posting transfers to the project's own ledger. The general ledger is a simulated service,
no real money moves, and no settlement finality is claimed.

## Design

- **Ledger in two modes.** Ordered locking takes per-account locks in ascending account order, so opposing
  transfers cannot deadlock. A lock-free CAS mode swaps an immutable snapshot of the balance table atomically,
  for comparison.
- **Idempotency.** A transfer id is claimed when it is submitted, before the queue. The first delivery does the
  work and every duplicate gets the same outcome, so the effect happens once. An answer of `QUEUE_FULL` releases the id, so a retry with it is processed.
- **Backpressure.** A bounded queue answers `QUEUE_FULL` after 100 ms instead of growing without limit. Workers run
  on platform threads or virtual threads with the same cap.
- **Resilience.** Each posting is published directly to the simulated general ledger through a retry (3 attempts)
  inside a circuit breaker. A failed publish goes into an outbox that a relay retries, and the general ledger is
  keyed by transfer id, so a resend is harmless. The faults it injects are latency, errors, lost
  acknowledgements and outages.
- **Invariants as tests.** jqwik property tests and concurrency stress tests run against both ledgers, and every
  measured row ends with six checks: total conserved, no negative balance, each transfer posted at most once,
  postings explain the balances, postings match the accepted transfers, and the general ledger holds the ledger's
  postings. The last one is a consistency check, not a reconciliation.

## Decisions and trade-offs

| Decision                        | Why                                                                       | Cost                                                                         |
| ------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Ordered locking as the default  | Simple to reason about, no deadlocks by construction                      | Hot accounts serialise                                                       |
| CAS snapshot as the alternative | Debits and credits two accounts atomically without locks                  | Each write copies the whole balance table; a failed swap discards the copy   |
| Outbox for the general ledger   | The ledger stays the source of truth while the downstream is down         | Eventual consistency; in the in-memory engine a crash loses pending postings |
| Engine free of Spring           | The Spring Boot API wraps it, and ArchUnit keeps Spring out of the engine | A little more wiring code                                                    |

## Results

The measured results are one committed run ([results.md at 3eb119a](https://github.com/TheSiddheshFulawade/settlement-lab/blob/3eb119a/results/results.md)), not a simulation. The run has 12 rows: ordered locking and CAS,
platform and virtual threads, and three fault profiles (none, flaky, outage), 100,000 submissions each.

- **Ordered locking answered 2.9× to 4.6× as many submissions per second as CAS** in the six like-for-like pairs.
  With 10,000 accounts every CAS write copies an 80 KB balance table. A small table with many readers could tip
  the balance the other way; this run did not test that.
- **Platform and virtual threads: no clear throughput winner** at the same cap of 8 workers. Virtual threads had the
  lower p99 and the higher p50 in all six pairs.
- **No collapse under faults.** Against the same configuration without faults, the rates of the eight fault rows were between 31%
  lower and 24% higher (−30.6% to +24.2%); one run cannot separate this from noise. Publishing runs off the worker
  threads. In the outage rows the outbox peaked at 86,480 to 95,181 postings and drained afterwards.
- **Every row passed all six invariants.**

Read the numbers with these limits: one run on 4 cores, JDK 21.0.13, in a cloud container. The rates count
submissions answered by the engine, including 2,006 duplicates and 802 to 853 rejections per row. They do not
include delivery to the general ledger. The ratios are not to be trusted to the decimal, and a repeat run and a
JDK 25 run are still to do.

## Status

On `main`: the engine and its runner, an HTTP API (submit, balances, metrics, an event stream, and runs with a
report), and a PostgreSQL ledger module with pessimistic and optimistic modes and a transactional outbox. The
measured results above are from the in-memory engine. There are no database results yet, and the API is not
deployed. A live page on this site that runs scenarios against it is a later release.
