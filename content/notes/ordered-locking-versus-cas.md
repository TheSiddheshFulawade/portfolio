---
id: ordered-locking-versus-cas
published: true
updated: 2026-11-23
title: Ordered locking versus CAS for moving money
summary: Two ways to debit one account and credit another atomically, and what each costs under contention.
date: 2026-11-19
tags: [concurrency, java, settlement-lab]
---

A transfer touches two balances. Debit A, credit B: either both happen or neither does, and no other
transfer may see the money in between. With many threads moving money at once, there are two common
ways to get that atomicity in Java. Settlement Lab implements both, so they can be measured under the
same load.

## Ordered locking

Give every account its own lock. A transfer takes the locks of both accounts, checks the funds,
debits, credits and releases.

The trap is deadlock. Thread 1 moves money from A to B and locks A. Thread 2 moves money from B to A
and locks B. Each now waits for the lock the other holds, forever.

The fix is a global lock order: always lock the account with the smaller id first, whatever the
direction of the transfer. Both threads then try A before B, one of them waits, and a cycle of waits
can no longer form. A deadlock test runs opposing transfers (A to B and B to A) from many threads at
once under a timeout; with ordered locking it always finishes.

What it costs: transfers that share an account run one after another. A single busy account becomes
a queue.

## Compare-and-set on a snapshot

The other approach takes no locks. The whole balance table is an immutable snapshot held in an
`AtomicReference`. A transfer reads the current snapshot, builds the next one with both balances
changed, and calls `compareAndSet(current, next)`. If another transfer got there first, the CAS fails
and the transfer retries from the new snapshot.

That is atomic across both accounts by construction: readers only ever see whole snapshots, before
or after a transfer, never in between.

What it costs: every write copies the table, and under heavy contention many threads compute a new
snapshot only to lose the race and start again. Work is thrown away instead of waited for.

## Which one wins

It depends on contention, which is why the lab measures rather than argues. The runner executes the
same workload against both ledgers, on platform threads and on virtual threads with the same
concurrency cap, and reports throughput, p50 and p99 latency, retries and the invariants for each
combination. The expectation going in:

- with many accounts and little overlap, CAS avoids lock overhead and may do well;
- with a few hot accounts, CAS retries pile up and ordered locking's simple queueing wins.

If the measurements disagree with that, the measurements win. CAS losing at high contention is a
valid result, and the README will say so.

## Invariants either way

Both ledgers are checked by the same property and stress tests: the total of all balances never
changes, no balance goes below zero, and no transfer is applied twice.
