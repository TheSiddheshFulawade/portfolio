/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCENARIO_LABELS } from './saga.model';

/*
 * RD-08 REQ-ACC-005: the model names the payflow commit it was read at, and each scenario says how much of it is built.
 *
 * Pin: payflow 167d172 (PR #8, test code only; SPEC.md is unchanged from 8566bf4, so the model's rules stand).
 *
 * Why these labels (PayFlow SPEC section 8 ticks and the test classes at 167d172):
 *   Merged: PF-01 to PF-06 (messaging, wallet, risk, payment API and happy path, compensation, timeouts, sweeper).
 *   Not merged: PF-07 security, PF-08 compose and demo, PF-09 system-tests (end-to-end and chaos C1 to C6), PF-10
 *   reconciliation, PF-11 README, PF-12 release. system-tests holds only DeployConfigTest: nothing runs the services
 *   together, and nothing kills a wallet or a broker.
 *   - completes: ReplyHappyPathTest, wallet CaptureFundsTest, RiskRulesTest cover each step per service.
 *   - duplicate-delivery: IdempotentConsumerTest, ConsumerOffsetAndPoisonTest, wallet redelivered-reserve tests.
 *   - insufficient-funds: wallet ReserveFundsTest (sticky rejection) and ReplyHappyPathTest.rejectedEndsTheSaga.
 *   - risk-rejection: RiskRulesTest, CompensationFlowTest (RiskRejected -> release -> REVERSED), wallet ReleaseFundsTest.
 *     No injected fault, every step has a merged per-service test: "merged, tested per service".
 *   - wallet-crash: the sweeper re-send and the wallet's single hold are tested per service, but a killed and restarted
 *     wallet is chaos C1 (PF-09, not merged): "partly merged".
 *   - broker-outage: the relay and the sweeper's postponement are tested per service (PaymentSweeperOutageTest), but
 *     a real broker restart is chaos C2 (PF-09, not merged): "partly merged".
 *   "specified, not built yet" fits no scenario at this pin; it is for PF-07 to PF-12 (security, compose, system tests,
 *   reconciliation), which the board's notes must say.
 */
describe('REQ-ACC-005 PayFlow model pin and scenario labels', () => {
  it('REQ-ACC-005 the model header names payflow 167d172 and no longer 8566bf4', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/shared/sim/saga.model.ts'), 'utf8');

    expect(src).toContain('167d172');
    expect(src).not.toContain('8566bf4');
  });

  it('REQ-ACC-005 each scenario carries the label derived from what is merged at 167d172', () => {
    expect(SCENARIO_LABELS).toEqual({
      completes: 'merged, tested per service',
      'duplicate-delivery': 'merged, tested per service',
      'insufficient-funds': 'merged, tested per service',
      'risk-rejection': 'merged, tested per service',
      'wallet-crash': 'partly merged',
      'broker-outage': 'partly merged',
    });
  });

  it('REQ-ACC-005 no scenario is labelled "specified, not built yet" while PF-06 is merged', () => {
    expect(Object.values(SCENARIO_LABELS)).not.toContain('specified, not built yet');
  });
});
