---
id: exactly-once-without-distributed-transactions
published: true
updated: 2026-11-23
title: Exactly-once without distributed transactions
summary: Networks deliver messages at least once. An idempotency key and an outbox turn that into an exactly-once effect.
date: 2026-11-19
tags: [payments, idempotency, reliability]
---

A payment instruction will sometimes arrive twice. A client times out and retries, a broker redelivers
after a consumer restart, an operator replays a batch. None of these are bugs: at-least-once delivery
is what networks and message brokers actually promise. The system's job is to make the _effect_
happen exactly once anyway.

Exactly-once delivery across a network is not available. Exactly-once _processing_ is, and it rests on
two small ideas.

## 1. An idempotency key on every request

Every transfer carries an id chosen by the sender, not the receiver. The receiver keeps a record of
the ids it has seen and the outcome of each one.

- The first time an id arrives, the transfer is processed and its outcome is stored under the id.
- Every later arrival of the same id returns the stored outcome. Nothing is applied again.

The detail that matters is concurrency. Two copies of the same transfer can arrive at the same moment
on two threads. "Check whether the id exists, then insert it" is a race: both threads can see "not
there". The check and the claim have to be one atomic step. In Settlement Lab that step is a
`putIfAbsent` of a future into a concurrent map: the first caller installs the future and does the
work, and every concurrent duplicate gets the same future and waits for the same outcome. In a
database, the same idea is a unique key on the id and an insert that either wins or reports a
conflict.

A property test makes this concrete: submit the same id from 50 threads at once, then assert that the
money moved once and that all 50 callers saw the same outcome.

## 2. An outbox for everything downstream

Applying a transfer usually means telling another system about it: a general ledger, a notification
service, a reporting store. If the ledger update succeeds and the downstream call then fails, the two
disagree. Wrapping both in a distributed transaction couples their availability: the ledger can
only commit when every participant is up.

The outbox pattern avoids that. The posting is recorded next to the ledger change, in the same local
atomic step, as "to be published". A relay publishes outbox entries and removes each one only after
the downstream system acknowledges it. If the downstream is slow or down, entries wait; the ledger
keeps working, and it stays the source of truth.

The relay can publish an entry twice (it crashed after sending, before removing it). That is fine,
because of point 1: the downstream system deduplicates by the same transfer id.

## What it costs

- **Eventual, not immediate, consistency** with downstream systems. For a general ledger that is
  usually acceptable; it has to be stated and monitored, not assumed.
- **Storage for idempotency records**, and a decision about how long to keep them. Too short, and a
  late retry is processed twice; too long, and the store grows without bound.
- **Discipline at every boundary**: each consumer has to deduplicate. One consumer that does not
  breaks the guarantee for everything behind it.

Settlement Lab implements both ideas in an in-memory engine, and its tests check the invariants
under concurrency and injected faults: no transfer applied twice, total money conserved, and the
general ledger eventually equal to the ledger.
