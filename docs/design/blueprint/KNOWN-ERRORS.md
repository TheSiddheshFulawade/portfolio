# Known errors in the blueprint

The blueprint (`style.css`, `body.html`, `script.js`) shows layout, spacing and behaviour. It is not a reference for mechanisms.
The audits of 2026-11-24 found the errors below in its three simulations. They are **not** fixed in `script.js`: the site's
models are written from the corrections here and from spec 005, which wins over the blueprint. Site copy already replaced by
approved content is not listed; personal and experience content is placeholder text.

IDs: W wrong, M misleading, I imprecise (technical audit); F finance audit. Pins: payflow `8840834` (a rename-only change after
`1d2f051`, where the code was read; its terminal state `REFUNDED` became `REVERSED`), settlement-lab `b863270`, results `3eb119a`.

## Dot field (spec 005 REQ-HOME-103, RD-05)

| ID | Error in the blueprint | Correction | Source |
| --- | --- | --- | --- |
| W1, F-04 | A partition shows "Reachable 0, Recovering 2,088": the near side also shifts more than 7 px and `draw()` counts displacement as "away". Dragging the pointer changes the counters. | Counters come from the model, never from pixels. Only far-side pairs are unreachable; the near side stays reachable. Pointer movement changes no counter. | Text beside the field; spec REQ-HOME-103 |
| W2, F-07 | "Recovering" counts entries that are only unreachable: a node that is down before replay, and a whole partition. | Counters: committed, reachable, unreachable, recovering (only while a node's log is replayed), duplicate transactions not applied, debits − credits. Committed = reachable + unreachable + recovering. A partition goes unreachable → reachable. | Spec REQ-HOME-103; PostgreSQL 18 docs, Write-Ahead Logging (REDO) |
| W3, F-05 | "Deliver the batch twice" re-delivers every third dot: 696 single legs, no complete pair. Debits arrive without their credits, and the counter counts legs. | Re-deliver whole transactions (both legs, one id) and count ids. "The batch" means every pair, otherwise "part of the batch". | Double entry: legs of one transaction commit together (settlement-lab `SPEC.md` REQ-LAB-002, 005 at b863270) |
| W4, F-03 | Legs separate during node recovery, because the restore time depends on each dot's index. Split pairs and a non-zero net of reachable entries were measured. The tile still shows 0 because it sums every dot. | One state and one recovery time per pair. The net of reachable entries is zero in every state. | Accounting identity; settlement-lab `SPEC.md` REQ-LAB-002, 005 at b863270 |
| W5, F-09 | The intro says entries "are recovered from the durable log" for all three failures. A partition replays nothing. "Recovered. Every committed posting is back" also appears after a duplicate batch, where nothing was lost. | Node: "Replayed from the log. Net still zero." Partition: "Link restored. Every posting can be read again." (with "entry" for "posting", F-06). Duplicate: "Nothing was applied a second time." State that the log is assumed to survive the node. | PostgreSQL 18 docs, Write-Ahead Logging (REDO); spec REQ-HOME-103 |
| F-06 | "Each dot is one committed posting", "postings net to zero", "every debit an equal credit". A dot is one debit or credit line. | A dot is one **entry**; two dots are one transaction. Each transaction has equal total debits and credits. A zero net shows that the books balance, not that they are right. | Accounting identity; settlement-lab `Posting` holds both accounts of one transfer (b863270) |
| M7, F-08 | "Settlement Lab asserts the real invariants after every run", under a field of nodes and partitions. | "A browser illustration of double entry. Neither project runs a replicated ledger. Settlement Lab checks a related property after every run: the sum of all balances is conserved." | settlement-lab README at b863270 (the measured engine is in memory, no nodes) |
| I13 | Label "Duplicates rejected". | "Duplicate transactions not applied". | Spec REQ-HOME-103 |

## Settlement Lab model (spec 005 REQ-PROJ-103, RD-07)

| ID | Error in the blueprint | Correction | Source |
| --- | --- | --- | --- |
| W9 | The breaker goes open → closed in one step; half-open is never in a snapshot. | Half-open lasts at least one visible step and a direct open → closed transition is illegal. `opens` counts every transition to open, also from half-open. | settlement-lab `ResilienceConfig`, `ResilientPublisher` at b863270; Resilience4j circuit breaker docs |
| W10 | 4 attempts per publish, no retry while half-open, opens after 3 consecutive failures, 1 probe. | 3 attempts in total, retry also in half-open, count window 20, minimum 10 calls, 50% failure rate, 3 half-open probes. Transfers, accounts, queue size and wait times are scaled down, and the page says so. | settlement-lab `ResilienceConfig` at b863270 |
| W11, F-16 | The checks use the repository's names but other rules. `POSTINGS_MATCH_ACCEPTED` compares counts, and `accepted` is filled by `post()` itself. `GL_MATCHES_POSTINGS` compares list order. | Port the six checks. `POSTINGS_MATCH_ACCEPTED` compares id sets, with accepted ids taken from the callers' outcomes. The general ledger is a map keyed by transfer id, so a second, different posting is refused. | settlement-lab `InvariantChecker` at b863270 |
| W12 | Duplicates use queue slots and are checked at the worker. Label "Duplicates rejected". | The id is claimed at submit, before the queue, and the original outcome is returned. Label: "Duplicates answered, not applied". | settlement-lab `SettlementEngine.accept`, `IdempotencyStore` at b863270 |
| W13, F-17 | The general ledger meter reads "623 delivered of 600", and falls short whenever a transfer is rejected. | The denominator is postings: "N of N postings delivered; R rejected for funds". | Blueprint runs; settlement-lab `OutboxPublisher` at b863270 |
| W14, F-19 | The verdict always blames the total, which holds for a few unsynchronised seeds, and it implies that a double posting changes the total. | Build the sentence from the checks that failed. A double posting keeps the total; `POSTED_AT_MOST_ONCE` catches it, `TOTAL_CONSERVED` does not. | settlement-lab `InvariantChecker` at b863270; 2,000 seeds of the blueprint model |
| M4 | Every posting goes through one outbox queue. Flaky is 14% plain errors. | Each posting is published directly (up to 16 senders), also while older ones wait. Only a failed publish enters the outbox, and one relay retries the head. Flaky is 10% errors and 5% recorded with the ack lost, answered `ALREADY_RECORDED` on retry. | settlement-lab README (L-06), `OutboxPublisher`, `FaultProfile` at b863270 |
| M5 | Playback runs at 210 ticks/s for CAS and 95 for the others, so CAS looks about as fast although it needs 3.3 times the ticks. | One playback rate for all modes. "Model ticks, not a measurement." | Blueprint runs |
| M6 | "Conflicts and waits" adds worker-ticks spent waiting for a lock to failed CAS swaps. | Show "Lock waits (worker-ticks)" or "CAS conflicts", by mode. | Blueprint code |
| M8 | Unsafe modes are "for contrast only". (The note in `body.html` is already corrected.) | They exist only in the browser model, not in the repository. | settlement-lab ledger modes at b863270 |
| M9, F-15 | The results are named transfers per second. (Headers and note in `body.html` are already corrected.) | Submissions answered by the engine, duplicates and rejections included; general ledger delivery is not in the rate. p99 is submit to outcome. | settlement-lab `ScenarioRunner`, `results/` at 3eb119a |
| M12 | The unordered mode is treated as always deadlocking. 25 of 2,000 seeds finished, and the page would then say only "All six invariants hold". | A run that finishes says "No deadlock this time; the risk remains." Tests use fixed seeds that deadlock. | 2,000 seeds of the blueprint model |
| I9, F-18 | Rejections average 0.1 per run, so `REJECTED_FUNDS` and `NO_NEGATIVE_BALANCE` are barely exercised. | Every seed rejects some transfers (the repository's runs reject about 0.8%). | settlement-lab `results/` at 3eb119a |
| I11 | A deadlocked run leaves the invariant list blank. | Show "not evaluated": the run never finishes, so the invariants cannot be asserted. | Spec REQ-PROJ-103 |

The model's queue of 64 is a scale-down of the repository's 1,024 (`RunnerSettings`), which 600 transfers would never fill.

## PayFlow simulation (spec 005 REQ-PROJ-102, RD-08)

| ID | Error in the blueprint | Correction | Source |
| --- | --- | --- | --- |
| W6, F-13 | One transaction is drawn as several steps: inbox first, then the balance or state, then the outbox. | Inbox row, effect and outgoing message change in one model step. The offset is committed afterwards. | payflow `IdempotentConsumer.handle`, `TransitionWriter.write` |
| W7, F-12 | `RECEIVED` is its own commit, and the 202 is returned before `ReserveFunds` exists. | One step records `RECEIVED` and `RESERVING` with `ReserveFunds`; the 202 follows the commit. Log: "Payment, its first events and ReserveFunds committed in one transaction. 202 returned." | payflow `PaymentService.create`, `PaymentController` |
| W8 | In the duplicate scenario the first `FundsCaptured` reaches the outbox only after the redelivery, and the re-sent copy only after `COMPLETED`. | Capture commits inbox +1, balances and one outbox row. The redelivered command leaves the inbox unchanged and adds an outbox row with the stored reply's message id. The relay publishes both; the first completes the payment and the orchestrator's inbox drops the second. | payflow `IdempotentConsumer`, `ReplyHandler` |
| M1, F-10 | All six scenarios look equally built. Compensation and the sweeper are not merged. | Label each scenario. Merged, tested per service: completes, duplicate delivery, insufficient funds. Partly merged: broker outage (relay merged, chaos test not). Specified, not built yet: risk rejection, wallet crash. | payflow `SagaStateMachine.on`, `ReplyHandler`, `SPEC.md` §8 |
| M10 | The broker outage is shorter than the step deadline, but nothing says so. | Log: "Kafka is unreachable for less than the 10 s deadline." A longer one adds attempt 2. | payflow `SPEC.md` §4, `DeadlinesProperties` |
| I1, F-14 | "No hold is created." | "Nothing is held; the refusal is recorded." The wallet writes a hold row in state `REJECTED`, so a re-sent command gets the same answer. | payflow `WalletCommandHandler.reserve` |
| I2, F-14 | "More than 5 payments in 60 s." | "VELOCITY: this payer already has 5 payments in the last 60 s. Both members share the count." The sixth is refused. | payflow `SPEC.md` (risk rules), `HazelcastVelocityClusterTest` |
| I6, F-14 | "Payment of 300", no unit. | State minor units: "300 minor units (₹3.00)". | payflow amounts are minor units (`SPEC.md`) |
| I10, F-14 | "Σ (available + held) … constant" is fixed text. | Compute it and print "constant" from a check: "Σ (available + held), both wallets; payee held is 0". | payflow REQ-PF-030 |
| I12 | The label does not name what it follows. (Already corrected in `body.html`.) | "A simplified model of the saga in PayFlow `SPEC.md` §4." | Spec REQ-ACC-004 |
| F-14 | "The payee never saw the money." | "Terminal: REVERSED. The hold was released; nothing was captured and the payee was never credited." | payflow `SPEC.md` §4 |

`REVERSED` means any hold was released and nothing was captured; it is also reached through a release tombstone, when nothing was
ever held. PayFlow's `ledger_entry` is a movement log (RESERVE and RELEASE are single rows): never call it double entry.
