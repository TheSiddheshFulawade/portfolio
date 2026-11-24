# Claim register

Technical and financial claims on the site and the source of each one. Rules: the `accuracy-baseline` skill. Rows are added
and verified by `technical-auditor` and `finance-auditor`. Only claims with a source are listed; findings stay out of the
repo until they are fixed.

| ID   | Where            | Claim or mechanism                                                                | Source                                                  | Verdict        |
| ---- | ---------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------- |
| C-01 | Home, dot field | Each transaction has equal total debits and credits, so entries net to zero; both legs commit together | accounting identity; settlement-lab `SPEC.md` REQ-LAB-002, 005 at b863270 | verified as a rule; view to audit, RD-05 |
| C-02 | Home, dot field | If the log survives, a failed node makes committed entries unreachable until replay, not uncommitted | PostgreSQL 18 docs, Write-Ahead Logging (wal-intro, REDO) | verified as a rule; view to audit, RD-05 |
| C-03 | PayFlow sim | Reserve, risk approval and capture are merged; terminal states COMPLETED, REFUNDED, REJECTED are specified | payflow `SPEC.md` §4, `SagaStateMachine` at 1d2f051 | verified (compensation: PF-06) |
| C-04 | PayFlow sim | A re-sent command has a new message id (sweeper specified, PF-06); the hold row prevents a second hold (merged) | payflow `WalletCommandHandler`, `V2__wallet.sql` at 1d2f051 | verified |
| C-05 | PayFlow sim | A redelivery has the same id; the wallet and risk inbox re-sends the stored reply with the reply's original message id | payflow `IdempotentConsumer` at 1d2f051 | verified |
| C-06 | PayFlow sim | Replies of another attempt, or late ones, change nothing | payflow `SagaStateMachine.on`, `ReplyHandler` at 1d2f051 | verified |
| C-07 | PayFlow | `REFUNDED`: any hold was released and nothing was captured (in card terms an authorisation reversal) | payflow `SPEC.md` §4 at 1d2f051; Visa, Authorization Reversals (PDF) | verified (specified) |
| C-08 | Settlement Lab | Ordered locking had 2.9× to 4.6× the submissions answered per second of CAS in six like-for-like pairs, on the in-memory ledger; one run, 4 cores, JDK 21.0.13, 10,000 accounts | settlement-lab `results/` at 3eb119a (unchanged at b863270), `ScenarioRunner` | verified |
| C-09 | Settlement Lab | Virtual threads had the lower p99 and the higher p50 in all six pairs; same run as C-08 | settlement-lab `results/results.json` at 3eb119a | verified |
| C-11 | PayFlow sim | Inbox row, effect and outgoing message commit in one transaction; the offset is committed afterwards | payflow `IdempotentConsumer`, `TransitionWriter`, `MessagingAutoConfiguration` at 1d2f051 | verified |
| C-12 | PayFlow sim | RECEIVED, RESERVING and ReserveFunds commit together; the 202 follows | payflow `PaymentService.create`, `PaymentController` at 1d2f051 | verified |
| C-13 | PayFlow | Deadlines 10 s, 5 s, 10 s (merged); 3 re-sends, then compensation (specified, PF-06) | payflow `SPEC.md` §4, `DeadlinesProperties` at 1d2f051 | verified |
| C-14 | Settlement Lab | In-memory engine: retry (3 attempts) inside a circuit breaker (window 20, minimum 10, 50%, 3 half-open probes); direct publish first, outbox on failure | settlement-lab `ResilienceConfig`, `ResilientPublisher`, `OutboxPublisher` at b863270 | verified |
| C-15 | PayFlow sim | Σ (available + held) over all wallets is constant (ops seeding excepted); capture debits the payer's hold and credits the payee in one local transaction | payflow `SPEC.md` §4 and REQ-PF-030, `JdbcWallets.capture` at 1d2f051 | verified |
| C-16 | Experience | e-Kuber 3.0 is RBI's next-generation core banking solution, under development | RBI Annual Report 2024-25, IX.38 and IX.51 (AnnualReportPublications Id=1439); 2026-27 agenda, IX.36 (Id=1469) | verified |
