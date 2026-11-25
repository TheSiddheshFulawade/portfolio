---
id: payflow
published: true
featured: true
order: 10
updated: 2026-11-24
title: PayFlow
tagline: A payment saga across three services. Reserve funds, check risk, capture.
status: In development
phase: in-development
stack: [Java, Spring Boot, Apache Kafka, PostgreSQL, Hazelcast, Testcontainers]
repo: https://github.com/TheSiddheshFulawade/payflow
proven:
  - "Messaging library: a business row and its outbox row commit together or not at all; a relay that crashes after sending and before marking the row sent causes a redelivery that is applied once; a consumer records the message id with the effect, so a duplicate has no second effect and a failed effect leaves no inbox row."
  - "wallet-service: 50 concurrent reserves of 30 against a balance of 1,000 (minor units) give exactly 33 holds and 17 refusals for insufficient funds; opposite-direction captures neither deadlock nor lose money; a re-sent reserve, capture or release has no second effect; random duplicated and shuffled commands keep the sum of available plus held over all wallets constant."
  - "risk-service: with the velocity rule stubbed out, 50 concurrent checks of 1,000,000 minor units for one payer approve exactly 20 and stop at the daily limit of 20,000,000; with the real counter, 20 concurrent checks approve exactly 5. In a two-member Hazelcast cluster the payer's sixth payment within 60 s is refused on both members, and a payment checked again counts once. A check the cluster never answers fails after its time bound and never approves."
  - "payment-service: creation commits RECEIVED and RESERVING together; the three success replies then move it through RISK_CHECKING and CAPTURING to COMPLETED, and a refused reserve ends REJECTED; the same Idempotency-Key and body returns the original payment and creates nothing, the same key with another body is refused with 422; a late, duplicate or other-attempt reply does not change the payment, its events or its outbox; property tests check that a terminal state is reached at most once and never left."
  - "CI at this commit: unit tests on Linux and Windows with JDK 21 and 25, and the Testcontainers integration tests on Linux, all green."
planned:
  - "Compensation: ReleaseFunds after a risk rejection or a failed capture, ending REVERSED. At this commit those replies are parked on the dead-letter topic with the hold still in place (PF-06)."
  - "Timeouts and the recovery sweeper: deadlines of 10 s, 5 s and 10 s per step are configured; the sweeper that re-sends an overdue command up to 3 times and then compensates is not built (PF-06)."
  - "Security: OAuth 2.0 resource servers validating Keycloak JWTs. Until then the client id is a constant and the services listen on loopback by default (PF-07)."
  - "Dockerfiles, a full Docker Compose stack and a demo script (PF-08)."
  - "Chaos tests that stop services and the Kafka broker in the middle of payments, then check the money invariants (PF-09)."
  - "End-of-day reconciliation with Spring Batch (PF-10)."
---

> Original work, built in public. It uses no employer design, naming, code or data. State described here: commit `8840834`.

## The problem

A payment that touches several services can fail halfway: a service crashes, the broker restarts, a message
arrives twice or is never answered. PayFlow is a design for keeping money safe in those cases: no money lost,
nothing charged twice, and every payment ending in one terminal state. It is in development: this page
describes the design and says what no test proves yet.

## The saga

Three Spring Boot services talk to each other only through Kafka and each owns its PostgreSQL database. payment-service is the
orchestrator and holds the state of every payment. wallet-service keeps available and held balances.
risk-service applies payment, daily and velocity limits. Money is held first, then checked, then captured, modelled on
card authorisation and capture. In cards a capture submits the payment for clearing and money moves at settlement;
here capture moves the balance at once.

1. `ReserveFunds` to wallet. `FundsReserved` moves the saga on; `FundsRejected` ends the payment `REJECTED`.
2. `CheckRisk` to risk. `RiskApproved` moves the saga on; `RiskRejected` leads to `ReleaseFunds`, then `REVERSED` (specified).
3. `CaptureFunds` to wallet. `FundsCaptured` completes the payment; `CaptureFailed` leads to `ReleaseFunds`, then `REVERSED`
   (specified).

A payment ends in one of three states: `COMPLETED`, `REVERSED` or `REJECTED`. Per wallet, reserve moves an
amount from available to held, release moves it back, and capture takes it from the payer's held and adds it to
the payee's available in one local transaction. The sum of available plus held over all wallets does not change, apart from operator seeding.

## What `REVERSED` means here

`REVERSED` means any hold was released and nothing was captured (an authorisation reversal). It is specified but not reachable in the merged code yet (compensation is planned, PF-06).
The name is not "refunded" because no captured money returns. No money leaves the payer before capture, so ending a
payment after a risk rejection or a failed capture means releasing the hold, and the payer's available balance is
restored. The same state is reached when a release arrives and no hold was ever recorded, in which case the
release leaves a tombstone so that a late reserve cannot hold money for a payment that already ended. A refund of
captured money would be a new transaction, which this saga does not make.

## Guarantees by design

- **No message without its state change, no second effect.** Outgoing messages are written to an outbox in the
  transaction of the state change. Consumers record the message id in an inbox with the effect. Delivery is at
  least once, so the effect is what happens once.
- **A re-sent command and a redelivered message are different cases.** A redelivery has the same message id and
  the inbox stops it. The sweeper, once built, re-sends a command with a new message id, so the hold row in
  wallet-service and the decision row in risk-service stop that case.
- **Every step is repeatable and every step before capture can be compensated.** Capture is the point after which
  a payment is complete; this saga does not undo it.

## Not claimed yet

Chaos behaviour (killing a service or the broker in the middle of a payment) is designed and specified in
`SPEC.md` until the system tests in PF-09 prove it. Nothing on this page is a measurement.
