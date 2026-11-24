# Claim register

Technical and financial claims on the site and the source of each one. Rules: the `accuracy-baseline` skill. Rows are added
and verified by `technical-auditor` and `finance-auditor`. Only claims with a source are listed; findings stay out of the
repo until they are fixed.

| ID   | Where            | Claim or mechanism                                                                | Source                                                  | Verdict        |
| ---- | ---------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------- |
| C-01 | Home, dot field  | Double-entry postings net to zero; both legs move together                        | accounting identity                                     | to audit, RD-01 |
| C-02 | Home, dot field  | A failed node makes committed postings unreachable, not uncommitted               | durability                                              | to audit, RD-01 |
| C-03 | PayFlow sim      | Reserve, risk check, capture; terminal states COMPLETED, REFUNDED, REJECTED       | payflow `SPEC.md` §4                                    | to audit, RD-01 |
| C-04 | PayFlow sim      | A re-sent command has a new id; the hold row prevents a second hold               | payflow `WalletCommandHandler` at 1d2f051               | to audit, RD-01 |
| C-05 | PayFlow sim      | A redelivery has the same id; the inbox re-sends the stored reply                 | payflow `docs/learn/PF-02-outbox-inbox.md` at 1d2f051   | to audit, RD-01 |
| C-06 | PayFlow sim      | Replies of another attempt are ignored                                            | payflow `ReplyHandler` at 1d2f051                       | to audit, RD-01 |
| C-07 | PayFlow          | `REFUNDED` means the hold was released (an authorisation reversal)                | payflow `SPEC.md` §4                                    | to audit, RD-01 |
| C-08 | Settlement Lab   | Ordered locking has 2.9× to 4.6× the throughput of CAS                            | settlement-lab `results/`                               | to audit, RD-01 |
| C-09 | Settlement Lab   | Virtual threads had the lower p99 in all six pairs                                | settlement-lab `results/`                               | to audit, RD-01 |
| C-10 | Settlement model | Safe modes keep all six invariants; unsafe modes deadlock or lose updates         | model tests (RD-07)                                     | to audit, RD-07 |
