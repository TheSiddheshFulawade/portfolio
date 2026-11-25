---
name: accuracy-baseline
description: Sources of truth, glossary, known traps and verdict rules for technical and financial correctness on the portfolio. Load before writing or reviewing any simulation, animation, diagram, engineering claim, financial term or measured number.
---

# Accuracy baseline

The site has one promise: nothing on it is wrong. A claim is published only if a source proves it.

## Sources of truth

| Subject                     | Source (read at a commit, never from memory)                             |
| --------------------------- | ------------------------------------------------------------------------ |
| PayFlow behaviour           | `TheSiddheshFulawade/payflow`: `SPEC.md`, `docs/adr/`, code on `main`    |
| Settlement Lab behaviour    | `TheSiddheshFulawade/settlement-lab`: `SPEC.md`, README, code on `main`  |
| Settlement Lab measurements | its `results/results.json` and `results/results.md`                      |
| Work history                | `docs/private/` resume, read only; resume-level facts (constitution 6.2) |
| Payments and settlement     | RBI · BIS/CPMI glossary · ISO 20022 · scheme documents                   |
| Card terms                  | card network and gateway documentation                                   |
| Platforms and libraries     | official documentation for the version used                              |

## Verdicts

`verified` (source named) · `wrong` · `misleading` · `unsupported` · `imprecise` · `UNVERIFIED` (could not check).
Nothing with an open `wrong`, `misleading` or `unsupported` verdict merges. The register of
sourced claims is `docs/accuracy/claims.md`. The repo is public: open findings go to `.cache/accuracy/open.md` (git-ignored).
A fix to a claim is re-audited; the author of a change never passes their own claim.

## Glossary (use these senses)

- **Double entry**: each transaction has equal total debits and credits, so entries net to zero. Netting to zero is necessary,
  not sufficient: a balanced ledger can still be wrong.
- **Transaction, entry, posting**: a transaction has two or more entries; an entry is one debit or credit line; posting is
  the act of recording them. Never call a leg a posting. Settlement Lab's `Posting` is one transfer with both accounts.
  The legs of one transaction commit together.
- **Clearing**: transmitting, reconciling and sometimes confirming transactions before settlement, possibly with netting.
- **Settlement, finality**: discharge of the obligation. Final settlement is irrevocable and unconditional, at a legally
  defined moment. It is never undone, only offset by a new transaction. Don't call an in-app state change "settlement"
  of real money, and never show a settled transaction or committed entry becoming uncommitted.
- **Authorisation**: the issuer's approval. **Hold**: the reserved amount; no money has moved to the payee. **Capture**: takes
  the held funds; in cards it submits for clearing and money moves at settlement, in PayFlow's model it moves the balance at once.
- **Reversal (or void)**: cancels an authorisation before capture or settlement. **Refund**: returns captured money in a new
  transaction. **Chargeback**: the issuer's return of a transaction through the card scheme,
  usually after a cardholder dispute (read a scheme document before the site uses the term). Don't swap these. "Void" is gateway usage.
- **Compensation** (saga): a new action that semantically undoes an earlier committed step. It is not a rollback.
- **Available, held, ledger balance**: available + held = the customer's total in PayFlow's model.
- **General ledger, sub-ledger**: the Lab's ledger plays the sub-ledger role. GL_MATCHES_POSTINGS is a consistency check,
  not a reconciliation, because the ledger feeds the general ledger.
- **Reconciliation**: comparing two independent records and explaining every difference.
- **RTGS**: real-time gross settlement: each payment settles individually, without netting. **NEFT**: half-hourly batches,
  24x7, deferred net settlement.
- **Exactly once**: say what it applies to. Delivery is at least once; the _effect_ happens once, through idempotency.

## Traps already found (check them every time)

1. PayFlow's sweeper (specified, PF-06) re-sends a command under a **new message id**, as the next attempt. The inbox stops a redelivery (same
   id); the hold row stops a re-sent command (new id), and risk-service's decision row does the same. Replies count only for the saga's current attempt.
2. A duplicate command makes the wallet re-send its **stored reply with the same message id**; the orchestrator's inbox drops it.
3. A redelivery needs a cause. For a duplicate the inbox drops: the offset was not committed after the database commit (crash
   or rebalance), or a relay crashed after the ack and before `sent_at`. A failed handler is also redelivered (9 retries,
   500 ms apart), but nothing was committed, so it is not a duplicate.
4. PayFlow's `REVERSED` (named REFUNDED before 8840834; specified, PF-06) means any hold was released (also by a release tombstone, when nothing was held): in card terms an authorisation reversal. Explain it wherever it appears.
5. Retry sits **inside** the circuit breaker in Settlement Lab: the breaker counts the outcome after retries.
6. Ordered locking against CAS is **2.9× to 4.6×** in throughput (172,734 / 59,859 = 2.886).
   One run, 4 cores, JDK 21.0.13: say so next to the numbers.
7. Unsynchronised or unordered modes exist only in the browser model. Label them unsafe and not part of the repository.
8. Deadlock means the run never finishes, so the invariants are "not evaluated", not "failed".
9. A browser simulation is never presented as a measurement, and measured numbers never come from a simulation.
10. A partition does not say which side may write. Don't claim quorum or consensus: neither project implements it.
11. PayFlow in development: chaos behaviour is designed and specified until the `system` CI job proves it.
12. Product names: Azure AI Foundry was announced on 19 Nov 2024 (before that, Azure AI Studio). The product names are Azure
    Notification Hubs and Red Hat Data Grid. Azure AI Foundry was later renamed Microsoft Foundry: not a name for 2024 work.
13. Settlement Lab rates count submissions answered by the engine (2,006 duplicates and 802 to 853 rejections per 100,000
    included); general ledger delivery is not in them.
14. A double posting keeps the total; POSTED_AT_MOST_ONCE catches it, TOTAL_CONSERVED does not.
15. PayFlow's `ledger_entry` is a movement log (RESERVE and RELEASE are single rows). Never call it double entry.
16. "40% less time" is not "40% faster".
17. PayFlow commits RECEIVED, RESERVING and the first command in one transaction, before the 202. Inbox row, effect and
    outgoing message commit together: never show them one after another.
18. Settlement Lab's in-memory engine publishes directly and its outbox holds only failed publishes; `ledger-postgres` writes
19. Neither repo has a licence: say "public" or "built in public", not "open source".
    every posting to a transactional outbox.

## Simulations

- The model is pure TypeScript with no DOM or timers, and a fixed seed. The view only draws it.
- Tests prove: conservation at every step, both legs together, legal state transitions only, one terminal state, and
  that unsafe modes really break the named invariant.
- Every scenario carries a label that it is a simplified model, and names the spec section it follows.
