/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MAX_RESENDS,
  SagaSim,
  SCENARIO_LABELS,
  STEP_DEADLINE_MS,
  stepDeadlineMs,
} from './saga.model';

/*
 * RD-08 (spec 005) PayFlow saga model. These tests are the contract for ./saga.model.ts.
 *
 * Sources, read at payflow commit 8566bf4 (PF-06): SPEC.md section 4 and 7, SagaStateMachine.on and overdue,
 * ReplyHandler, TransitionWriter, PaymentService.create, PaymentSweeper, StepDeadlines, DeadlinesProperties,
 * IdempotentConsumer.handle, OutboxRelay, WalletCommandHandler, Hold, RiskCommandHandler.
 *
 * Contract assumed (the model is free in everything else):
 *   new SagaSim(scenario, seed?)     step(): one atomic commit OR one delivery OR one relay ack OR one fault toggle
 *   done: true only when the payment is terminal AND every outbox is drained; step() after done changes nothing
 *   snapshot (a read-only view, tests clone it):
 *     timeMs          model time, never decreasing, advanced by the model (no wall clock)
 *     state           'NONE' before the request, then RESERVING, RISK_CHECKING, CAPTURING, RELEASING and a terminal
 *                     COMPLETED | REVERSED | REJECTED. 'RECEIVED' is never visible (it commits with RESERVING).
 *     attempt         the step attempt of the current command (first send is 1)
 *     terminal        boolean
 *     amount          the payment amount in minor units (integer > 0)
 *     inbox / outbox  { payment, wallet, risk } counts (outbox = rows not yet acked by the broker)
 *     outboxRows      { service, messageId, type, attempt }[]
 *     wallets         { payer, payee } each { available, held } in minor units
 *     holds           { state: 'RESERVED' | 'RELEASED' | 'CAPTURED' | 'REJECTED' }[] (the wallet's hold rows)
 *     brokerUp, walletUp
 *   events (append only): { code, service, type?, messageId?, attempt? } with these codes:
 *     PAYMENT_COMMITTED  payment   RECEIVED + RESERVING + ReserveFunds committed together (service 'payment')
 *     HTTP_202           payment   after PAYMENT_COMMITTED, in the same step
 *     RELAY_PUBLISHED    owner of the outbox row; type, messageId, attempt of the row; the broker acked it
 *     MESSAGE_APPLIED    consumer; first delivery: inbox row + effect + outgoing row in one commit
 *     REPLY_IGNORED      payment   first delivery of a reply for another attempt: inbox row stays, nothing else
 *     DUPLICATE_DROPPED  consumer; same message id again: inbox unchanged; a wallet or risk consumer queues its
 *                        stored reply again under the stored reply's message id; the orchestrator queues nothing
 *     REDELIVERED        wallet    the broker delivers a command again (offset not committed after the database commit)
 *     COMMAND_RESENT     payment   the sweeper: same command, NEW message id, attempt + 1, in one commit
 *     BROKER_DOWN, BROKER_UP, WALLET_DOWN, WALLET_UP   (service 'broker' / 'wallet')
 *   message types: ReserveFunds CheckRisk CaptureFunds ReleaseFunds FundsReserved FundsRejected RiskApproved
 *                  RiskRejected FundsCaptured FundsReleased
 *   exports: SCENARIO_LABELS, STEP_DEADLINE_MS { reserve, risk, capture } (ms), MAX_RESENDS, stepDeadlineMs(step, attempt)
 */

type Scenario =
  | 'completes'
  | 'wallet-crash'
  | 'duplicate-delivery'
  | 'risk-rejection'
  | 'broker-outage'
  | 'insufficient-funds';
type Svc = 'payment' | 'wallet' | 'risk';
interface Money {
  available: number;
  held: number;
}
interface Row {
  service: Svc;
  messageId: string;
  type: string;
  attempt: number;
}
interface Snap {
  timeMs: number;
  state: string;
  attempt: number;
  terminal: boolean;
  amount: number;
  inbox: Record<Svc, number>;
  outbox: Record<Svc, number>;
  outboxRows: Row[];
  wallets: { payer: Money; payee: Money };
  holds: { state: string }[];
  brokerUp: boolean;
  walletUp: boolean;
}
interface Ev {
  code: string;
  service: string;
  type?: string;
  messageId?: string;
  attempt?: number;
}
interface Frame {
  before: Snap;
  after: Snap;
  events: Ev[];
}
interface Trace {
  initial: Snap;
  frames: Frame[];
  events: Ev[];
}

const SCENARIOS: Scenario[] = [
  'completes',
  'wallet-crash',
  'duplicate-delivery',
  'risk-rejection',
  'broker-outage',
  'insufficient-funds',
];
const SVCS: Svc[] = ['payment', 'wallet', 'risk'];
const MAX_STEPS = 300;

const snap = (sim: SagaSim): Snap => structuredClone(sim.snapshot) as unknown as Snap;
const evs = (sim: SagaSim): Ev[] => structuredClone(sim.events) as unknown as Ev[];

function run(scenario: Scenario, seed?: number): Trace {
  const sim = new SagaSim(scenario, seed);
  const initial = snap(sim);
  const frames: Frame[] = [];
  while (!sim.done) {
    if (frames.length >= MAX_STEPS) {
      throw new Error(`${scenario} did not finish in ${MAX_STEPS} steps`);
    }
    const before = snap(sim);
    const seen = sim.events.length;
    sim.step();
    frames.push({ before, after: snap(sim), events: evs(sim).slice(seen) });
  }
  return { initial, frames, events: evs(sim) };
}

const total = (m: Money): number => m.available + m.held;
const sigma = (s: Snap): number => total(s.wallets.payer) + total(s.wallets.payee);
const has = (f: Frame, code: string, service?: string): boolean =>
  f.events.some((e) => e.code === code && (service === undefined || e.service === service));
const all = (t: Trace, code: string, service?: string): Ev[] =>
  t.events.filter((e) => e.code === code && (service === undefined || e.service === service));
const frameOf = (t: Trace, pred: (f: Frame) => boolean): Frame => {
  const f = t.frames.find(pred);
  if (!f) throw new Error('no step matches');
  return f;
};
const sumOut = (s: Snap): number => s.outbox.payment + s.outbox.wallet + s.outbox.risk;
const finalOf = (t: Trace): Snap => t.frames[t.frames.length - 1]!.after;
const stateOrder = (t: Trace): string[] => {
  const out: string[] = [];
  for (const f of t.frames) {
    if (f.after.state !== 'NONE' && out[out.length - 1] !== f.after.state) out.push(f.after.state);
  }
  return out;
};
const rowsOf = (s: Snap, service: Svc, type: string): Row[] =>
  s.outboxRows.filter((r) => r.service === service && r.type === type);
const newRows = (f: Frame): Row[] => {
  const known = (r: Row): boolean =>
    f.before.outboxRows.some(
      (b) => b.service === r.service && b.messageId === r.messageId && b.type === r.type,
    );
  return f.after.outboxRows.filter((r) => !known(r));
};

const PATH_OK = ['RESERVING', 'RISK_CHECKING', 'CAPTURING', 'COMPLETED'];
const EXPECT: Record<Scenario, { state: string; hold: string; path: string[] }> = {
  completes: { state: 'COMPLETED', hold: 'CAPTURED', path: PATH_OK },
  'duplicate-delivery': { state: 'COMPLETED', hold: 'CAPTURED', path: PATH_OK },
  'broker-outage': { state: 'COMPLETED', hold: 'CAPTURED', path: PATH_OK },
  // SPEC 4 + SagaStateMachine.on/overdue: the wallet is back inside the 3 re-sends, so the attempt-2 answer matches
  // and the saga goes on; the attempt-1 answer is ignored. No compensation is reached.
  'wallet-crash': { state: 'COMPLETED', hold: 'CAPTURED', path: PATH_OK },
  // SPEC 4 table step 2: RiskRejected -> ReleaseFunds -> REVERSED, only after the wallet's FundsReleased
  'risk-rejection': {
    state: 'REVERSED',
    hold: 'RELEASED',
    path: ['RESERVING', 'RISK_CHECKING', 'RELEASING', 'REVERSED'],
  },
  // SPEC 4 table step 1: FundsRejected -> REJECTED, nothing held so nothing to release
  'insufficient-funds': { state: 'REJECTED', hold: 'REJECTED', path: ['RESERVING', 'REJECTED'] },
};
const LEGAL: Record<string, string[]> = {
  NONE: ['RESERVING'],
  RESERVING: ['RISK_CHECKING', 'REJECTED', 'RELEASING'],
  RISK_CHECKING: ['CAPTURING', 'RELEASING'],
  CAPTURING: ['COMPLETED', 'RELEASING'],
  RELEASING: ['REVERSED', 'COMPLETED'],
};
const TERMINAL = ['COMPLETED', 'REVERSED', 'REJECTED'];

describe('PayFlow saga model: contract and labels', () => {
  it('REQ-PROJ-102 REQ-ACC-005 every scenario carries one of the three labels', () => {
    const allowed = ['merged, tested per service', 'partly merged', 'specified, not built yet'];

    expect(Object.keys(SCENARIO_LABELS).sort()).toEqual([...SCENARIOS].sort());
    for (const s of SCENARIOS) {
      expect(allowed).toContain((SCENARIO_LABELS as Record<string, string>)[s]);
    }
  });

  it('REQ-PROJ-102 step deadlines are 10 s, 5 s, 10 s and doubling per attempt up to the 30 s cap, 3 re-sends', () => {
    expect(STEP_DEADLINE_MS).toEqual({ reserve: 10_000, risk: 5_000, capture: 10_000 });
    expect(MAX_RESENDS).toBe(3);
    expect([1, 2, 3, 4].map((a) => stepDeadlineMs('reserve', a))).toEqual([
      10_000, 20_000, 30_000, 30_000,
    ]);
    expect([1, 2, 3, 4].map((a) => stepDeadlineMs('risk', a))).toEqual([
      5_000, 10_000, 20_000, 30_000,
    ]);
    expect([1, 2, 3, 4].map((a) => stepDeadlineMs('capture', a))).toEqual([
      10_000, 20_000, 30_000, 30_000,
    ]);
  });

  it.each(SCENARIOS)(
    'REQ-PROJ-105 %s starts idle, not done, with nothing committed and amounts in minor units',
    (s) => {
      const sim = new SagaSim(s);
      const v = snap(sim);

      expect(sim.done).toBe(false);
      expect(v.state).toBe('NONE');
      expect(v.terminal).toBe(false);
      expect(Number.isInteger(v.amount) && v.amount > 0).toBe(true);
      for (const w of [v.wallets.payer, v.wallets.payee]) {
        expect(Number.isInteger(w.available) && Number.isInteger(w.held)).toBe(true);
      }
      expect(v.wallets.payer.held + v.wallets.payee.held).toBe(0);
      expect(v.outboxRows).toEqual([]);
      expect(v.holds).toEqual([]);
      expect(sim.events).toEqual([]);
    },
  );

  it.each(SCENARIOS)(
    'REQ-PROJ-105 %s ends by itself, drained, and a step after done changes nothing',
    (s) => {
      const sim = new SagaSim(s);
      let guard = 0;
      while (!sim.done && guard++ < MAX_STEPS) sim.step();
      const end = snap(sim);
      const count = sim.events.length;

      sim.step();

      expect(sim.done).toBe(true);
      expect(end.terminal).toBe(true);
      expect(sumOut(end)).toBe(0);
      expect(snap(sim)).toEqual(end);
      expect(sim.events.length).toBe(count);
    },
  );
});

describe('PayFlow saga model: terminal states', () => {
  it.each(SCENARIOS)(
    'REQ-PROJ-102 %s ends in its terminal state through legal transitions only',
    (s) => {
      const t = run(s);

      expect(finalOf(t).state).toBe(EXPECT[s].state);
      expect(finalOf(t).terminal).toBe(true);
      expect(stateOrder(t)).toEqual(EXPECT[s].path);
      for (const f of t.frames) {
        if (f.before.state !== f.after.state) {
          expect(LEGAL[f.before.state] ?? []).toContain(f.after.state);
        }
      }
    },
  );

  it.each(SCENARIOS)(
    'REQ-PROJ-102 %s the wallet hold ends in its expected state, and only one hold exists',
    (s) => {
      const end = finalOf(run(s));

      expect(end.holds.map((h) => h.state)).toEqual([EXPECT[s].hold]);
    },
  );

  it.each(SCENARIOS)(
    'REQ-PROJ-102 %s reaches exactly one terminal state and nothing changes after it',
    (s) => {
      const t = run(s);
      const first = t.frames.findIndex((f) => f.after.terminal);
      const entering = t.frames.filter((f) => !f.before.terminal && f.after.terminal);
      const after = t.frames.slice(first + 1);

      expect(first).toBeGreaterThanOrEqual(0);
      expect(entering).toHaveLength(1);
      expect(TERMINAL.filter((x) => t.frames.some((f) => f.after.state === x))).toEqual([
        EXPECT[s].state,
      ]);
      for (const f of after) {
        expect(f.after.terminal).toBe(true);
        expect(f.after.state).toBe(f.before.state);
        expect(f.after.attempt).toBe(f.before.attempt);
        expect(f.after.wallets).toEqual(f.before.wallets);
        expect(f.after.holds).toEqual(f.before.holds);
        expect(f.after.outbox.payment).toBeLessThanOrEqual(f.before.outbox.payment);
        expect(has(f, 'COMMAND_RESENT')).toBe(false);
        expect(has(f, 'MESSAGE_APPLIED', 'payment')).toBe(false);
      }
    },
  );

  it('REQ-PROJ-102 REQ-PF-010 REQ-PF-013 the duplicate scenario is still in flight after COMPLETED, and the late copy changes nothing', () => {
    const t = run('duplicate-delivery');
    const first = t.frames.findIndex((f) => f.after.terminal);

    expect(first).toBeLessThan(t.frames.length - 1);
    expect(t.frames.slice(first + 1).some((f) => has(f, 'DUPLICATE_DROPPED', 'payment'))).toBe(
      true,
    );
  });
});

describe('PayFlow saga model: money', () => {
  it.each(SCENARIOS)(
    'REQ-PF-030 %s: Σ(available + held) over both wallets is constant after every step',
    (s) => {
      const t = run(s);
      const start = sigma(t.initial);

      expect(start).toBeGreaterThan(0);
      for (const f of t.frames) expect(sigma(f.after)).toBe(start);
    },
  );

  it.each(SCENARIOS)(
    'REQ-PF-030 %s: no balance is ever negative and the payee never holds money',
    (s) => {
      const t = run(s);

      for (const f of [{ after: t.initial }, ...t.frames]) {
        for (const w of [f.after.wallets.payer, f.after.wallets.payee]) {
          expect(w.available).toBeGreaterThanOrEqual(0);
          expect(w.held).toBeGreaterThanOrEqual(0);
        }
        expect(f.after.wallets.payee.held).toBe(0);
      }
    },
  );

  it.each(SCENARIOS)(
    'REQ-PF-030 %s: held is 0 and no hold is RESERVED at the terminal state and when done',
    (s) => {
      const t = run(s);

      for (const f of t.frames.filter((x) => x.after.terminal)) {
        expect(f.after.wallets.payer.held).toBe(0);
        expect(f.after.wallets.payee.held).toBe(0);
        expect(f.after.holds.some((h) => h.state === 'RESERVED')).toBe(false);
      }
    },
  );

  it.each(['completes', 'wallet-crash', 'duplicate-delivery', 'broker-outage'] as Scenario[])(
    'REQ-PF-010 %s: COMPLETED has exactly one capture, one payer debit and one payee credit, in one step',
    (s) => {
      const t = run(s);
      const a = t.initial.amount;
      const credits = t.frames.filter(
        (f) => f.after.wallets.payee.available !== f.before.wallets.payee.available,
      );
      const debits = t.frames.filter(
        (f) => total(f.after.wallets.payer) !== total(f.before.wallets.payer),
      );

      expect(finalOf(t).state).toBe('COMPLETED');
      expect(credits).toHaveLength(1);
      expect(debits).toHaveLength(1);
      expect(debits[0]).toBe(credits[0]);
      expect(
        credits[0]!.after.wallets.payee.available - credits[0]!.before.wallets.payee.available,
      ).toBe(a);
      expect(total(credits[0]!.before.wallets.payer) - total(credits[0]!.after.wallets.payer)).toBe(
        a,
      );
      expect(finalOf(t).wallets.payee.available).toBe(t.initial.wallets.payee.available + a);
      expect(total(finalOf(t).wallets.payer)).toBe(total(t.initial.wallets.payer) - a);
      expect(finalOf(t).wallets.payer.available).toBe(t.initial.wallets.payer.available - a);
    },
  );

  it.each(['risk-rejection', 'insufficient-funds'] as Scenario[])(
    'REQ-PF-010 %s: REVERSED or REJECTED moves no money between the wallets, at any step',
    (s) => {
      const t = run(s);

      expect(['REVERSED', 'REJECTED']).toContain(finalOf(t).state);
      for (const f of t.frames) {
        expect(f.after.wallets.payee).toEqual(t.initial.wallets.payee);
        expect(total(f.after.wallets.payer)).toBe(total(t.initial.wallets.payer));
      }
      expect(finalOf(t).wallets.payer).toEqual(t.initial.wallets.payer);
    },
  );
});

describe('PayFlow saga model: one commit, one step', () => {
  it.each(SCENARIOS)(
    'REQ-PROJ-102 %s: RECEIVED is never alone, RECEIVED, RESERVING and ReserveFunds commit in one step, 202 follows',
    (s) => {
      const t = run(s);
      const first = t.frames[0]!;

      expect(first.before.state).toBe('NONE');
      expect(first.after.state).toBe('RESERVING');
      expect(first.after.attempt).toBe(1);
      expect(first.events.map((e) => e.code)).toEqual(['PAYMENT_COMMITTED', 'HTTP_202']);
      expect(first.after.outbox.payment).toBe(1);
      expect(first.after.outboxRows.map((r) => [r.service, r.type, r.attempt])).toEqual([
        ['payment', 'ReserveFunds', 1],
      ]);
      expect(first.after.inbox).toEqual(first.before.inbox);
      for (const f of [{ after: t.initial }, ...t.frames])
        expect(f.after.state).not.toBe('RECEIVED');
      expect(t.frames.slice(1).some((f) => has(f, 'HTTP_202') || has(f, 'PAYMENT_COMMITTED'))).toBe(
        false,
      );
    },
  );

  it.each(SCENARIOS)(
    'REQ-PROJ-102 %s: a first delivery changes inbox, effect and outgoing message in the same step',
    (s) => {
      const t = run(s);
      const applied = t.frames.filter((f) => has(f, 'MESSAGE_APPLIED'));

      expect(applied.length).toBeGreaterThan(0);
      for (const f of applied) {
        const svc = f.events.find((e) => e.code === 'MESSAGE_APPLIED')!.service as Svc;
        expect(f.after.inbox[svc] - f.before.inbox[svc]).toBe(1);
        if (svc === 'payment') {
          // the orchestrator moves the payment and queues the next command (none once terminal)
          expect(f.after.state).not.toBe(f.before.state);
          expect(f.after.outbox.payment - f.before.outbox.payment).toBe(f.after.terminal ? 0 : 1);
        } else {
          // wallet and risk queue exactly one reply
          expect(f.after.outbox[svc] - f.before.outbox[svc]).toBe(1);
          expect(newRows(f)).toHaveLength(1);
        }
      }
    },
  );

  it('REQ-PROJ-102 reserve: the hold, the balances, the inbox row and FundsReserved appear in one step', () => {
    const f = frameOf(run('completes'), (x) => has(x, 'MESSAGE_APPLIED', 'wallet'));
    const a = f.after.amount;

    expect(f.events[0]!.type).toBe('ReserveFunds');
    expect(f.before.holds).toEqual([]);
    expect(f.after.holds.map((h) => h.state)).toEqual(['RESERVED']);
    expect(f.after.wallets.payer.available).toBe(f.before.wallets.payer.available - a);
    expect(f.after.wallets.payer.held).toBe(a);
    expect(f.after.inbox.wallet).toBe(f.before.inbox.wallet + 1);
    expect(newRows(f).map((r) => r.type)).toEqual(['FundsReserved']);
  });

  it('REQ-PROJ-102 capture: payer hold debit, payee credit, inbox row and FundsCaptured appear in one step', () => {
    const f = frameOf(run('completes'), (x) =>
      x.events.some((e) => e.code === 'MESSAGE_APPLIED' && e.type === 'CaptureFunds'),
    );
    const a = f.after.amount;

    expect(f.after.wallets.payer.held).toBe(0);
    expect(f.after.wallets.payee.available).toBe(f.before.wallets.payee.available + a);
    expect(f.after.holds.map((h) => h.state)).toEqual(['CAPTURED']);
    expect(f.after.inbox.wallet).toBe(f.before.inbox.wallet + 1);
    expect(newRows(f).map((r) => r.type)).toEqual(['FundsCaptured']);
  });

  it.each(SCENARIOS)(
    'REQ-PROJ-102 %s: no effect before its commit (state, money, holds and inbox change only in a committing step)',
    (s) => {
      const t = run(s);
      const committing = (f: Frame): boolean =>
        has(f, 'PAYMENT_COMMITTED') || has(f, 'MESSAGE_APPLIED');

      for (const f of t.frames) {
        if (f.before.state !== f.after.state) expect(committing(f)).toBe(true);
        if (
          JSON.stringify(f.before.wallets) !== JSON.stringify(f.after.wallets) ||
          f.before.holds.length !== f.after.holds.length
        ) {
          expect(has(f, 'MESSAGE_APPLIED', 'wallet')).toBe(true);
        }
        for (const svc of SVCS) {
          const consumed = f.events.filter(
            (e) =>
              (e.code === 'MESSAGE_APPLIED' || e.code === 'REPLY_IGNORED') && e.service === svc,
          ).length;
          expect(f.after.inbox[svc] - f.before.inbox[svc]).toBe(consumed);
        }
        if (sumOut(f.after) > sumOut(f.before)) {
          expect(
            ['PAYMENT_COMMITTED', 'MESSAGE_APPLIED', 'COMMAND_RESENT', 'DUPLICATE_DROPPED'].some(
              (c) => has(f, c),
            ),
          ).toBe(true);
        }
      }
    },
  );

  it('REQ-PROJ-102 a command that is published but not yet consumed has no effect yet', () => {
    const t = run('completes');
    const published = frameOf(t, (x) =>
      x.events.some((e) => e.code === 'RELAY_PUBLISHED' && e.type === 'ReserveFunds'),
    );
    const applied = frameOf(t, (x) => has(x, 'MESSAGE_APPLIED', 'wallet'));

    expect(t.frames.indexOf(published)).toBeLessThan(t.frames.indexOf(applied));
    expect(published.after.holds).toEqual([]);
    expect(published.after.wallets).toEqual(t.initial.wallets);
  });

  it('REQ-PROJ-102 the payment is COMPLETED only after the wallet has already committed the capture', () => {
    const f = frameOf(
      run('completes'),
      (x) => x.after.state === 'COMPLETED' && x.before.state !== 'COMPLETED',
    );

    expect(f.before.holds.map((h) => h.state)).toEqual(['CAPTURED']);
    expect(f.before.wallets.payee.available).toBeGreaterThan(0);
    expect(f.before.wallets.payer.held).toBe(0);
  });
});

describe('PayFlow saga model: outbox, relay and ids', () => {
  it.each(SCENARIOS)(
    'REQ-PF-020 %s: the outbox count falls only on the relay publish ack, one row per ack',
    (s) => {
      const t = run(s);

      for (const f of t.frames) {
        for (const svc of SVCS) {
          const acks = f.events.filter(
            (e) => e.code === 'RELAY_PUBLISHED' && e.service === svc,
          ).length;
          const queued = f.after.outbox[svc] - f.before.outbox[svc] + acks;
          expect(queued).toBeGreaterThanOrEqual(0);
          if (acks === 0) expect(f.after.outbox[svc]).toBeGreaterThanOrEqual(f.before.outbox[svc]);
        }
        for (const e of f.events.filter((x) => x.code === 'RELAY_PUBLISHED')) {
          expect(f.before.brokerUp).toBe(true);
          expect(
            f.before.outboxRows.some((r) => r.messageId === e.messageId && r.service === e.service),
          ).toBe(true);
        }
        expect(f.after.outboxRows).toHaveLength(sumOut(f.after));
      }
    },
  );

  it.each(SCENARIOS)(
    'REQ-PF-020 %s: a message is delivered only after the relay published it, and a first delivery is never a duplicate',
    (s) => {
      const t = run(s);
      const published = new Set<string>();
      const applied = new Set<string>();
      for (const e of t.events) {
        if (e.code === 'RELAY_PUBLISHED') published.add(e.messageId!);
        if (e.code === 'MESSAGE_APPLIED' || e.code === 'REPLY_IGNORED') {
          expect(published.has(e.messageId!)).toBe(true);
          expect(applied.has(`${e.service}/${e.messageId}`)).toBe(false);
          applied.add(`${e.service}/${e.messageId}`);
        }
        if (e.code === 'DUPLICATE_DROPPED') {
          expect(applied.has(`${e.service}/${e.messageId}`)).toBe(true);
        }
      }
      for (const svc of SVCS) {
        expect(finalOf(t).inbox[svc]).toBe(
          [...applied].filter((k) => k.startsWith(`${svc}/`)).length,
        );
      }
    },
  );

  it('REQ-PF-012 trap 1: a re-sent command (sweeper) has a new message id and the next attempt', () => {
    const t = run('wallet-crash');
    const sent = frameOf(t, (f) => has(f, 'COMMAND_RESENT'));
    const first = frameOf(t, (f) => has(f, 'PAYMENT_COMMITTED'));
    const original = first.after.outboxRows[0]!;
    const resent = newRows(sent);

    expect(resent).toHaveLength(1);
    expect(resent[0]!.type).toBe('ReserveFunds');
    expect(resent[0]!.messageId).not.toBe(original.messageId);
    expect(resent[0]!.attempt).toBe(2);
    expect(sent.after.attempt).toBe(sent.before.attempt + 1);
    expect(sent.events[0]).toMatchObject({
      type: 'ReserveFunds',
      messageId: resent[0]!.messageId,
      attempt: 2,
    });
    expect(sent.after.state).toBe(sent.before.state);
    expect(sent.after.inbox).toEqual(sent.before.inbox);
    expect(sent.after.wallets).toEqual(sent.before.wallets);
    expect(sent.after.timeMs - first.after.timeMs).toBeGreaterThanOrEqual(STEP_DEADLINE_MS.reserve);
    expect(all(t, 'COMMAND_RESENT')).toHaveLength(1);
  });

  it.each(SCENARIOS)(
    'REQ-PF-012 %s: no step is re-sent before its deadline, and never more than 3 times',
    (s) => {
      const t = run(s);

      expect(Math.max(...t.frames.map((f) => f.after.attempt))).toBeLessThanOrEqual(
        MAX_RESENDS + 1,
      );
      for (const f of t.frames.filter((x) => has(x, 'COMMAND_RESENT'))) {
        const type = f.events.find((e) => e.code === 'COMMAND_RESENT')!.type;
        const key = type === 'ReserveFunds' ? 'reserve' : type === 'CheckRisk' ? 'risk' : 'capture';
        const sentAt = t.frames.filter(
          (x) =>
            x.after.timeMs <= f.before.timeMs && x.after.outboxRows.some((r) => r.type === type),
        );
        expect(sentAt.length).toBeGreaterThan(0);
        expect(f.after.timeMs).toBeGreaterThanOrEqual(STEP_DEADLINE_MS[key]);
      }
    },
  );

  it('REQ-PF-021 trap 3: a redelivery has the same message id, type and attempt as the delivery that was applied', () => {
    const t = run('duplicate-delivery');
    const applied = t.events.find(
      (e) => e.code === 'MESSAGE_APPLIED' && e.type === 'CaptureFunds',
    )!;
    const dup = all(t, 'DUPLICATE_DROPPED', 'wallet');

    expect(dup).toHaveLength(1);
    expect(dup[0]).toMatchObject({
      type: 'CaptureFunds',
      messageId: applied.messageId,
      attempt: applied.attempt,
    });
    expect(t.events.indexOf(dup[0]!)).toBeGreaterThan(t.events.indexOf(applied));
  });

  it('REQ-PF-021 trap 3 M1: Kafka redelivers the capture with a cause event, after the first apply and before the drop', () => {
    const t = run('duplicate-delivery');
    const applied = t.events.find(
      (e) => e.code === 'MESSAGE_APPLIED' && e.type === 'CaptureFunds',
    )!;
    const cause = all(t, 'REDELIVERED');
    const dup = all(t, 'DUPLICATE_DROPPED', 'wallet')[0]!;

    expect(cause).toHaveLength(1);
    expect(cause[0]).toMatchObject({
      service: 'wallet',
      type: 'CaptureFunds',
      messageId: applied.messageId,
      attempt: applied.attempt,
    });
    expect(t.events.indexOf(cause[0]!)).toBeGreaterThan(t.events.indexOf(applied));
    expect(t.events.indexOf(cause[0]!)).toBeLessThan(t.events.indexOf(dup));
  });

  it.each(SCENARIOS.filter((s) => s !== 'duplicate-delivery'))(
    'REQ-PF-021 trap 3 M1: %s has no redelivery',
    (s) => {
      expect(all(run(s), 'REDELIVERED')).toHaveLength(0);
    },
  );

  it("REQ-PF-021 trap 2 W8: a redelivered command adds no inbox row and no effect, and one outbox row with the stored reply's message id", () => {
    const t = run('duplicate-delivery');
    const capture = frameOf(t, (f) =>
      f.events.some((e) => e.code === 'MESSAGE_APPLIED' && e.type === 'CaptureFunds'),
    );
    const dup = frameOf(t, (f) => has(f, 'DUPLICATE_DROPPED', 'wallet'));
    const stored = newRows(capture).find((r) => r.type === 'FundsCaptured')!;
    const added = newRows({
      ...dup,
      before: { ...dup.before, outboxRows: dup.before.outboxRows.filter((r) => r !== stored) },
    });

    expect(t.frames.indexOf(dup)).toBeGreaterThan(t.frames.indexOf(capture));
    expect(dup.after.inbox).toEqual(dup.before.inbox);
    expect(dup.after.outbox.wallet).toBe(dup.before.outbox.wallet + 1);
    expect(dup.after.wallets).toEqual(dup.before.wallets);
    expect(dup.after.holds).toEqual(dup.before.holds);
    expect(dup.after.state).toBe(dup.before.state);
    expect(rowsOf(dup.after, 'wallet', 'FundsCaptured').map((r) => r.messageId)).toEqual(
      rowsOf(dup.after, 'wallet', 'FundsCaptured').map(() => stored.messageId),
    );
    // both copies carry the id of the first reply, published separately
    expect(added.every((r) => r.type === 'FundsCaptured' && r.messageId === stored.messageId)).toBe(
      true,
    );
    const published = all(t, 'RELAY_PUBLISHED', 'wallet').filter((e) => e.type === 'FundsCaptured');
    expect(published).toHaveLength(2);
    expect(published.map((e) => e.messageId)).toEqual([stored.messageId, stored.messageId]);
  });

  it("REQ-PF-021 W8: the first FundsCaptured completes the payment and the orchestrator's inbox drops the second, adding neither inbox row nor outbox row", () => {
    const t = run('duplicate-delivery');
    const drop = frameOf(t, (f) => has(f, 'DUPLICATE_DROPPED', 'payment'));
    const complete = frameOf(
      t,
      (f) => f.after.state === 'COMPLETED' && f.before.state !== 'COMPLETED',
    );

    expect(t.frames.indexOf(drop)).toBeGreaterThan(t.frames.indexOf(complete));
    expect(drop.events[0]).toMatchObject({ type: 'FundsCaptured' });
    expect(drop.after.inbox).toEqual(drop.before.inbox);
    expect(drop.after.outbox).toEqual(drop.before.outbox);
    expect(drop.after.outboxRows.filter((r) => r.service === 'payment')).toEqual(
      drop.before.outboxRows.filter((r) => r.service === 'payment'),
    );
    expect(drop.after.state).toBe('COMPLETED');
    expect(drop.after.wallets).toEqual(drop.before.wallets);
    expect(
      all(t, 'MESSAGE_APPLIED', 'payment').filter((e) => e.type === 'FundsCaptured'),
    ).toHaveLength(1);
  });

  it('REQ-PF-013 trap 1: a reply for another attempt is ignored (inbox row stays, state, money and outbox unchanged)', () => {
    const t = run('wallet-crash');
    const f = frameOf(t, (x) => has(x, 'REPLY_IGNORED'));
    const ignored = f.events.find((e) => e.code === 'REPLY_IGNORED')!;

    expect(ignored.type).toBe('FundsReserved');
    expect(ignored.attempt).toBe(1);
    expect(f.before.attempt).toBe(2);
    expect(f.after.state).toBe(f.before.state);
    expect(f.after.attempt).toBe(f.before.attempt);
    expect(f.after.wallets).toEqual(f.before.wallets);
    expect(f.after.outbox).toEqual(f.before.outbox);
    expect(f.after.inbox.payment).toBe(f.before.inbox.payment + 1);
    expect(all(t, 'REPLY_IGNORED')).toHaveLength(1);
  });

  it('REQ-PF-013 the matching attempt-2 reply is the one that moves the saga on', () => {
    const t = run('wallet-crash');
    const f = frameOf(
      t,
      (x) => x.before.state === 'RESERVING' && x.after.state === 'RISK_CHECKING',
    );
    const applied = f.events.find((e) => e.code === 'MESSAGE_APPLIED')!;

    expect(applied).toMatchObject({ type: 'FundsReserved', attempt: 2, service: 'payment' });
    expect(f.before.attempt).toBe(2);
  });

  it('REQ-PF-011 REQ-PF-021 every message id is unique to one message: only a stored-reply copy repeats an id', () => {
    const t = run('duplicate-delivery');
    const created = new Map<string, Set<string>>();
    for (const f of t.frames) {
      for (const r of newRows(f)) {
        const kinds = created.get(r.messageId) ?? new Set<string>();
        kinds.add(`${r.service}/${r.type}/${r.attempt}`);
        created.set(r.messageId, kinds);
      }
    }
    for (const kinds of created.values()) expect(kinds.size).toBe(1);
    expect(created.size).toBeGreaterThan(0);
  });
});

describe('PayFlow saga model: scenarios', () => {
  it('REQ-PROJ-102 wallet crash: the wallet handles nothing while it is down, the sweeper re-sends after the deadline, COMPLETED with one hold', () => {
    const t = run('wallet-crash');
    const down = t.frames.findIndex((f) => has(f, 'WALLET_DOWN'));
    const up = t.frames.findIndex((f) => has(f, 'WALLET_UP'));
    const resend = t.frames.findIndex((f) => has(f, 'COMMAND_RESENT'));
    const firstWallet = t.frames.findIndex((f) => has(f, 'MESSAGE_APPLIED', 'wallet'));

    expect(down).toBeGreaterThanOrEqual(0);
    expect(down).toBeLessThan(resend);
    expect(resend).toBeLessThan(up);
    expect(up).toBeLessThan(firstWallet);
    for (const f of t.frames.slice(down, up)) {
      expect(f.after.walletUp === false || has(f, 'WALLET_DOWN') || has(f, 'WALLET_UP')).toBe(true);
    }
    for (const f of t.frames.filter(
      (x) => x.before.walletUp === false && x.after.walletUp === false,
    )) {
      expect(f.after.inbox.wallet).toBe(f.before.inbox.wallet);
      expect(f.after.holds).toEqual(f.before.holds);
      expect(f.after.wallets).toEqual(f.before.wallets);
    }
    expect(finalOf(t).state).toBe('COMPLETED');
    expect(finalOf(t).holds).toHaveLength(1);
  });

  it('REQ-PROJ-102 wallet crash: both ReserveFunds are consumed, the second under its own inbox row, and money is held only once', () => {
    const t = run('wallet-crash');
    const reserves = t.frames.filter((f) =>
      f.events.some((e) => e.code === 'MESSAGE_APPLIED' && e.type === 'ReserveFunds'),
    );
    const [one, two] = reserves;

    expect(reserves).toHaveLength(2);
    expect(one!.after.wallets.payer.held).toBe(one!.after.amount);
    expect(two!.after.inbox.wallet).toBe(two!.before.inbox.wallet + 1);
    expect(two!.after.wallets).toEqual(two!.before.wallets);
    expect(two!.after.holds).toEqual(two!.before.holds);
    expect(newRows(two!).map((r) => [r.type, r.attempt])).toEqual([['FundsReserved', 2]]);
    expect(newRows(one!).map((r) => [r.type, r.attempt])).toEqual([['FundsReserved', 1]]);
  });

  it('REQ-PROJ-102 wallet crash: after the saga moves on, the step attempt count of the new step starts again at 1', () => {
    const t = run('wallet-crash');
    const f = frameOf(
      t,
      (x) => x.after.state === 'RISK_CHECKING' && x.before.state === 'RESERVING',
    );

    expect(f.after.attempt).toBe(1);
    expect(f.after.outboxRows.filter((r) => r.type === 'CheckRisk').map((r) => r.attempt)).toEqual([
      1,
    ]);
  });

  it('REQ-PROJ-102 M10 broker outage: shorter than the 10 s deadline, one attempt, the relay keeps the row until Kafka returns', () => {
    const t = run('broker-outage');
    const down = frameOf(t, (f) => has(f, 'BROKER_DOWN'));
    const up = frameOf(t, (f) => has(f, 'BROKER_UP'));
    const commit = frameOf(t, (f) => has(f, 'PAYMENT_COMMITTED'));
    const kept = frameOf(
      t,
      (f) => !f.after.brokerUp && f.after.outbox.payment === 1 && f.after.state === 'RESERVING',
    );
    const waiting = kept.after.outboxRows[0]!;
    const published = all(t, 'RELAY_PUBLISHED', 'payment')[0]!;

    expect(up.after.timeMs - down.after.timeMs).toBeLessThan(STEP_DEADLINE_MS.reserve);
    expect(up.after.timeMs - commit.after.timeMs).toBeLessThan(STEP_DEADLINE_MS.reserve);
    expect(up.after.timeMs).toBeGreaterThanOrEqual(down.after.timeMs);
    expect(Math.max(...t.frames.map((f) => f.after.attempt))).toBe(1);
    expect(has(t.frames[0]!, 'COMMAND_RESENT')).toBe(false);
    expect(all(t, 'COMMAND_RESENT')).toHaveLength(0);
    expect(waiting.type).toBe('ReserveFunds');
    expect(published.messageId).toBe(waiting.messageId);
    expect(t.events.indexOf(published)).toBeGreaterThan(t.events.indexOf(all(t, 'BROKER_UP')[0]!));
    for (const f of t.frames.filter((x) => !x.before.brokerUp)) {
      expect(sumOut(f.after)).toBeGreaterThanOrEqual(sumOut(f.before));
      expect(has(f, 'RELAY_PUBLISHED')).toBe(false);
      expect(f.after.inbox).toEqual(f.before.inbox);
    }
  });

  it('REQ-PROJ-102 risk rejection: RiskRejected, ReleaseFunds, the wallet releases the hold, and only then REVERSED with the payee never credited', () => {
    const t = run('risk-rejection');
    const reject = frameOf(t, (f) => f.after.state === 'RELEASING');
    const release = frameOf(t, (f) =>
      f.events.some((e) => e.code === 'MESSAGE_APPLIED' && e.type === 'ReleaseFunds'),
    );
    const reversed = frameOf(
      t,
      (f) => f.after.state === 'REVERSED' && f.before.state !== 'REVERSED',
    );
    const a = t.initial.amount;

    expect(reject.events.find((e) => e.code === 'MESSAGE_APPLIED')).toMatchObject({
      type: 'RiskRejected',
      service: 'payment',
    });
    expect(rowsOf(reject.after, 'payment', 'ReleaseFunds')).toHaveLength(1);
    // while RELEASING and before the wallet answers, the money is still held
    expect(reject.after.wallets.payer.held).toBe(a);
    expect(release.before.state).toBe('RELEASING');
    expect(release.before.holds.map((h) => h.state)).toEqual(['RESERVED']);
    expect(release.after.holds.map((h) => h.state)).toEqual(['RELEASED']);
    expect(release.after.wallets.payer).toEqual(t.initial.wallets.payer);
    expect(newRows(release).map((r) => r.type)).toEqual(['FundsReleased']);
    expect(t.frames.indexOf(release)).toBeLessThan(t.frames.indexOf(reversed));
    expect(reversed.before.wallets.payer.held).toBe(0);
    expect(reversed.after.wallets.payee).toEqual(t.initial.wallets.payee);
    expect(all(t, 'MESSAGE_APPLIED').some((e) => e.type === 'CaptureFunds')).toBe(false);
  });

  it('REQ-PROJ-102 I1 insufficient funds: the wallet records a REJECTED hold, holds nothing, and the saga stops at REJECTED without risk or release', () => {
    const t = run('insufficient-funds');
    const wallet = frameOf(t, (f) => has(f, 'MESSAGE_APPLIED', 'wallet'));
    const types = t.events.map((e) => e.type);

    expect(t.initial.wallets.payer.available).toBeLessThan(t.initial.amount);
    expect(wallet.before.holds).toEqual([]);
    expect(wallet.after.holds.map((h) => h.state)).toEqual(['REJECTED']);
    expect(wallet.after.wallets).toEqual(wallet.before.wallets);
    expect(newRows(wallet).map((r) => r.type)).toEqual(['FundsRejected']);
    expect(wallet.after.inbox.wallet).toBe(1);
    expect(finalOf(t).state).toBe('REJECTED');
    expect(finalOf(t).inbox.risk).toBe(0);
    for (const forbidden of ['CheckRisk', 'CaptureFunds', 'ReleaseFunds'])
      expect(types).not.toContain(forbidden);
  });

  it.each(['completes', 'duplicate-delivery', 'broker-outage', 'risk-rejection'] as Scenario[])(
    'REQ-PROJ-102 %s: the payer can afford the payment, so the hold is the only difference to insufficient funds',
    (s) => {
      const i = run(s).initial;

      expect(i.wallets.payer.available).toBeGreaterThanOrEqual(i.amount);
    },
  );

  it.each([
    'completes',
    'duplicate-delivery',
    'risk-rejection',
    'insufficient-funds',
  ] as Scenario[])(
    'REQ-PROJ-102 %s: no fault is injected, so no attempt above 1 and no re-send',
    (s) => {
      const t = run(s);

      expect(Math.max(...t.frames.map((f) => f.after.attempt))).toBe(1);
      expect(all(t, 'COMMAND_RESENT')).toHaveLength(0);
      expect(t.frames.every((f) => f.after.brokerUp && f.after.walletUp)).toBe(true);
    },
  );
});

describe('PayFlow saga model: determinism and purity', () => {
  it.each(SCENARIOS)('REQ-ACC-003 %s: the same seed gives the same trace, ids included', (s) => {
    expect(run(s, 7)).toEqual(run(s, 7));
    expect(run(s)).toEqual(run(s));
  });

  it('REQ-ACC-003 the seed drives the message ids', () => {
    const ids = (seed: number): string[] =>
      run('completes', seed)
        .frames.flatMap((f) => f.after.outboxRows.map((r) => r.messageId))
        .sort();

    expect(ids(1)).not.toEqual(ids(2));
  });

  it('REQ-ACC-003 the model source uses no Date, Math.random, timers, DOM or Angular', () => {
    const dir = join(process.cwd(), 'src/app/shared/sim');
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));
    const strip = (src: string): string =>
      src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const banned: [RegExp, string][] = [
      [/\bDate\b/, 'Date'],
      [/Math\s*\.\s*random/, 'Math.random'],
      [
        /\b(setTimeout|setInterval|setImmediate|queueMicrotask|requestAnimationFrame|requestIdleCallback)\b/,
        'timer',
      ],
      [/\bperformance\b/, 'performance'],
      [/\bcrypto\b/, 'crypto'],
      [/\b(document|window|globalThis|navigator)\b/, 'DOM or global'],
      [/@angular|from\s+['"]rxjs/, 'framework import'],
    ];

    expect(files).toContain('saga.model.ts');
    for (const file of files) {
      const code = strip(readFileSync(join(dir, file), 'utf8'));
      for (const [re, name] of banned) {
        expect(re.test(code), `${file} uses ${name}`).toBe(false);
      }
    }
  });
});
