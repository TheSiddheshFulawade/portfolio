/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { SettlementSim, checkInvariants } from './settlement.model';

// REQ-PROJ-103, REQ-ACC-003: the Settlement Lab model is pure and seeded; the view only draws it.
// It follows settlement-lab at e3c1b91 (InvariantChecker, SettlementEngine, IdempotencyStore, OutboxPublisher,
// ResilientPublisher, ResilienceConfig, FaultProfile, FakeGeneralLedger) with scaled-down sizes, and corrects the
// blueprint errors W9 to W14, M4 to M6, M12, I9 and I11 (docs/design/blueprint/KNOWN-ERRORS.md).
//
// Assumed contract (types come from the implementation):
//   new SettlementSim({ mode, fault, seed })   step()   readonly snapshot   readonly events   readonly runRecord
//   checkInvariants(run: RunRecord): Record<InvariantName, boolean> | 'not-evaluated'   (exported, pure)
//
//   snapshot = { tick, end: ''|'done'|'deadlock'|'timeout', unsafe,
//     queueDepth, queueCapacity (64), outboxDepth, version,
//     openingBalances: number[], balances: number[], locks: (number|null)[]  (owner worker index per account),
//     workers: { state: string, accounts: number[] }[8]   (accounts = [from, to] of the transfer in hand, else []),
//     postings: { sequence, transferId, from, to, amount }[], generalLedger: Record<transferId, Posting>,
//     breaker: 'closed'|'open'|'half-open', opens, retries, rejected, duplicatesAnswered, lockWaits, casConflicts,
//     cycle: number[]  (worker indexes of the deadlock cycle, else []) }
//   runRecord = { openingTotal, openingBalances, balances, postings, acceptedIds, generalLedger, end? }; checkInvariants
//     answers 'not-evaluated' when record.end is 'deadlock' or 'timeout' (the run never finished).
//   events are objects { tick, code, transferId?, source?, attempt?, result?, outcome? }, in this order and codes:
//     QUEUED{transferId}  POSTED{transferId}  REJECTED_FUNDS{transferId}   (the caller's outcome; one per distinct id)
//     DUPLICATE_ANSWERED{transferId, outcome}   (outcome = the original's: POSTED or REJECTED_FUNDS; emitted once it is known)
//     A publish to the general ledger is contiguous: GL_ATTEMPT{transferId, source:'direct'|'relay', attempt:1..3,
//       result:'RECORDED'|'ALREADY_RECORDED'|'ERROR'|'ACK_LOST'|'OUTAGE'} repeated, then PUBLISH_OK|PUBLISH_FAILED
//       {transferId, source}, then (if the breaker changes) BREAKER_OPEN|BREAKER_HALF_OPEN|BREAKER_CLOSED.
//     GL_NOT_PERMITTED{transferId, source}  (breaker open: no call, counts as a failed publish, not recorded by the breaker)
//     OUTBOX_ENQUEUED{transferId}  OUTBOX_DELIVERED{transferId}
//     DEADLOCK_DETECTED (run ends 'deadlock')   NO_DEADLOCK_THIS_TIME (an unordered run that ends 'done')

type Mode = 'ordered' | 'cas' | 'unordered' | 'unsynchronised';
type Fault = 'none' | 'flaky' | 'outage';
type Snap = SettlementSim['snapshot'];
type RunRecord = Parameters<typeof checkInvariants>[0];
type Posting = Snap['postings'][number];
interface Ev {
  tick: number;
  code: string;
  transferId?: string;
  source?: 'direct' | 'relay';
  attempt?: number;
  result?: string;
  outcome?: string;
}

const NAMES = [
  'TOTAL_CONSERVED',
  'NO_NEGATIVE_BALANCE',
  'POSTED_AT_MOST_ONCE',
  'POSTINGS_EXPLAIN_BALANCES',
  'POSTINGS_MATCH_ACCEPTED',
  'GL_MATCHES_POSTINGS',
] as const;
type Name = (typeof NAMES)[number];

const SEEDS = Array.from({ length: 30 }, (_, i) => 20_261_100 + i);
const FAULTS: Fault[] = ['none', 'flaky', 'outage'];
const SAFE: Mode[] = ['ordered', 'cas'];
const ALL: Mode[] = ['ordered', 'cas', 'unordered', 'unsynchronised'];
const MAX_STEPS = 60_000; // a run still going by then is a bug (the model has its own 'timeout')
const T = 180_000;
const TRANSFERS = 600;
const QUEUE = 64;
const ALL_TRUE = Object.fromEntries(NAMES.map((n) => [n, true])) as Record<Name, boolean>;

const evs = (s: SettlementSim): Ev[] => [...s.events] as unknown as Ev[];
const sum = (a: readonly number[]): number => a.reduce((x, y) => x + y, 0);
const failing = (r: Record<string, boolean>): string[] => NAMES.filter((n) => !r[n]);

// ---------------------------------------------------------------------------------------------------------
// Running the model

interface Step {
  tick: number;
  end: string;
  queueDepth: number;
  queueCapacity: number;
  total: number;
  min: number;
  breaker: string;
  opens: number;
  outboxDepth: number;
  glKeys: number;
  held: number;
  events: number;
}
interface Trace {
  sim: SettlementSim;
  steps: Step[];
  fin: Snap;
}

function light(s: Snap, events: number): Step {
  return {
    tick: s.tick,
    end: s.end,
    queueDepth: s.queueDepth,
    queueCapacity: s.queueCapacity,
    total: sum(s.balances),
    min: Math.min(...s.balances),
    breaker: s.breaker,
    opens: s.opens,
    outboxDepth: s.outboxDepth,
    glKeys: Object.keys(s.generalLedger).length,
    held: s.locks.filter((l: unknown) => l !== null && l !== undefined).length,
    events,
  };
}

const cache = new Map<string, Trace>();
function play(mode: Mode, fault: Fault, seed: number): Trace {
  const key = `${mode}/${fault}/${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const sim = new SettlementSim({ mode, fault, seed });
  const steps: Step[] = [];
  while (sim.snapshot.end === '' && steps.length < MAX_STEPS) {
    sim.step();
    steps.push(light(sim.snapshot, sim.events.length));
  }
  const trace = { sim, steps, fin: sim.snapshot };
  cache.set(key, trace);
  return trace;
}

/** Seeds (as a list, for readable failures) for which a check does not hold. */
const badSeeds = (mode: Mode, fault: Fault, ok: (t: Trace) => boolean): number[] =>
  SEEDS.filter((seed) => !ok(play(mode, fault, seed)));

// ---------------------------------------------------------------------------------------------------------
// Independent oracle: a port of InvariantChecker semantics written from the Java, sharing nothing with the model.
// Ids are compared as sets, the general ledger by transfer id, balances are replayed from the postings.

function oracle(r: RunRecord): Record<Name, boolean> {
  const postings = [...r.postings] as Posting[];
  const bySequence = [...postings].sort((a, b) => a.sequence - b.sequence);
  const seen = new Set<string>();
  let once = true;
  for (const p of bySequence) {
    if (seen.has(p.transferId)) once = false;
    seen.add(p.transferId);
  }
  const replay = [...r.openingBalances];
  for (const p of postings) {
    replay[p.from] -= p.amount;
    replay[p.to] += p.amount;
  }
  const posted = new Set(postings.map((p) => p.transferId));
  const accepted = new Set(r.acceptedIds);
  const ledger = new Map<string, Posting>();
  for (const p of postings) ledger.set(p.transferId, p);
  const gl = new Map<string, Posting>(Object.entries(r.generalLedger as Record<string, Posting>));
  const same = (a: Posting, b: Posting) =>
    a.sequence === b.sequence &&
    a.transferId === b.transferId &&
    a.from === b.from &&
    a.to === b.to &&
    a.amount === b.amount;
  let glOk = true;
  for (const [id, p] of ledger) {
    const g = gl.get(id);
    if (g === undefined || !same(g, p)) glOk = false;
  }
  for (const id of gl.keys()) if (!ledger.has(id)) glOk = false;
  return {
    TOTAL_CONSERVED: sum(r.openingBalances) === sum(r.balances),
    NO_NEGATIVE_BALANCE: r.balances.every((b: number) => b >= 0),
    POSTED_AT_MOST_ONCE: once,
    POSTINGS_EXPLAIN_BALANCES:
      replay.length === r.balances.length && replay.every((v, i) => v === r.balances[i]),
    POSTINGS_MATCH_ACCEPTED:
      posted.size === accepted.size && [...posted].every((id) => accepted.has(id)),
    GL_MATCHES_POSTINGS: glOk,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Audit of the event log: retry, breaker, direct publish, outbox and general ledger rules, replayed from events by a
// reference model written here (Resilience4j semantics as configured by ResilienceConfig.defaults()).

const WINDOW = 20;
const MIN_CALLS = 10;
const FAILURE_PERCENT = 50;
const PROBES = 3;
const ATTEMPTS = 3;
const SENDERS = 16;
const SUCCESS = new Set(['RECORDED', 'ALREADY_RECORDED']);

interface Audit {
  v: Record<string, string[]>;
  retries: number;
  opens: number;
  notPermitted: number;
  halfOpenFailed: number[]; // attempts used by publishes that failed while half-open
  halfOpenPublishes: number;
  directWhileOutbox: number;
  maxDirectPerTick: number;
  maxRelayPerTick: number;
  ackLostThenAlready: number;
  fresh: { total: number; error: number; lost: number };
  results: Set<string>;
  outageTicks: { first: number; last: number } | null;
  recordedTicks: number[];
  outboxPeak: number;
}

function audit(t: Trace): Audit {
  const events = evs(t.sim);
  const done = t.fin.end === 'done';
  const rules = ['attempts', 'breaker', 'direct', 'relay', 'outbox', 'generalLedger', 'structure'];
  const v: Record<string, string[]> = Object.fromEntries(rules.map((r) => [r, []]));
  const a: Audit = {
    v,
    retries: 0,
    opens: 0,
    notPermitted: 0,
    halfOpenFailed: [],
    halfOpenPublishes: 0,
    directWhileOutbox: 0,
    maxDirectPerTick: 0,
    maxRelayPerTick: 0,
    ackLostThenAlready: 0,
    fresh: { total: 0, error: 0, lost: 0 },
    results: new Set(),
    outageTicks: null,
    recordedTicks: [],
    outboxPeak: 0,
  };
  let state: 'closed' | 'open' | 'half-open' = 'closed';
  let window: boolean[] = [];
  let probes: boolean[] = [];
  let pending: 'open' | 'closed' | null = null;
  const stored = new Set<string>();
  const outbox: string[] = [];
  const posted = new Set<string>();
  const directDone = new Set<string>();
  const firstSource = new Map<string, string>();
  const failedDirect = new Set<string>();
  let pendingDeliver: string | null = null;
  const directPerTick = new Map<number, number>();
  const relayPerTick = new Map<number, number>();
  let cur: { id: string; source: string; results: string[]; startState: string } | null = null;
  let i = 0;

  const publishEnd = (id: string, source: string, ok: boolean, tick: number) => {
    if (!firstSource.has(id)) firstSource.set(id, source);
    if (source === 'direct') {
      directPerTick.set(tick, (directPerTick.get(tick) ?? 0) + 1);
      if (directDone.has(id)) v['direct'].push(`event ${i}: ${id} published directly twice`);
      directDone.add(id);
      if (!posted.has(id)) v['direct'].push(`event ${i}: ${id} published before it was posted`);
      if (outbox.length > 0) a.directWhileOutbox++;
      if (!ok) failedDirect.add(id);
    } else {
      relayPerTick.set(tick, (relayPerTick.get(tick) ?? 0) + 1);
      if (firstSource.get(id) !== 'direct')
        v['direct'].push(`event ${i}: ${id} reached the relay before a direct publish`);
      if (outbox.length === 0)
        v['relay'].push(`event ${i}: relay published ${id} with an empty outbox`);
      else if (outbox[0] !== id)
        v['relay'].push(`event ${i}: relay published ${id}, but the head is ${outbox[0]}`);
      if (ok) pendingDeliver = id;
    }
  };

  for (const step of t.steps) {
    for (; i < step.events; i++) {
      const e = events[i];
      const expectedCode =
        pending === 'open' ? 'BREAKER_OPEN' : pending === 'closed' ? 'BREAKER_CLOSED' : null;
      if (pending !== null && e.code !== expectedCode) {
        v['breaker'].push(
          `event ${i}: breaker must go ${pending} right after the publish that decided it, saw ${e.code}`,
        );
        pending = null;
      }
      if (pendingDeliver !== null && e.code !== 'OUTBOX_DELIVERED') {
        v['outbox'].push(
          `event ${i}: a successful relay publish of ${pendingDeliver} must be followed by OUTBOX_DELIVERED`,
        );
        pendingDeliver = null;
      }
      const id = e.transferId ?? '';
      switch (e.code) {
        case 'POSTED':
          posted.add(id);
          break;
        case 'GL_ATTEMPT': {
          const result = e.result ?? '';
          a.results.add(result);
          if (state === 'open')
            v['breaker'].push(
              `event ${i}: a call reached the general ledger while the breaker was open`,
            );
          if (cur && (cur.id !== id || cur.source !== e.source)) {
            v['structure'].push(`event ${i}: publish of ${cur.id} interleaved with ${id}`);
            cur = null;
          }
          if (!cur) cur = { id, source: e.source ?? '', results: [], startState: state };
          const n = cur.results.length + 1;
          if (e.attempt !== n)
            v['attempts'].push(`event ${i}: ${id} attempt numbered ${e.attempt}, expected ${n}`);
          if (n > ATTEMPTS)
            v['attempts'].push(
              `event ${i}: ${id} attempt ${n} exceeds ${ATTEMPTS} attempts in total`,
            );
          const prev = cur.results[cur.results.length - 1];
          if (prev !== undefined && SUCCESS.has(prev))
            v['attempts'].push(`event ${i}: ${id} retried after success`);
          if (n > 1) a.retries++;
          const isStored = stored.has(id);
          if (result === 'RECORDED' && isStored)
            v['generalLedger'].push(`event ${i}: ${id} RECORDED twice, a second entry`);
          if (result === 'ALREADY_RECORDED' && !isStored)
            v['generalLedger'].push(`event ${i}: ${id} ALREADY_RECORDED but never stored`);
          if (prev === 'ACK_LOST' && result === 'ALREADY_RECORDED') a.ackLostThenAlready++;
          if (!isStored) {
            a.fresh.total++;
            if (result === 'ERROR') a.fresh.error++;
            if (result === 'ACK_LOST') a.fresh.lost++;
          }
          if (result === 'RECORDED' || result === 'ACK_LOST') stored.add(id);
          if (result === 'RECORDED') a.recordedTicks.push(e.tick);
          if (result === 'OUTAGE') {
            a.outageTicks = a.outageTicks
              ? { first: a.outageTicks.first, last: e.tick }
              : { first: e.tick, last: e.tick };
          }
          cur.results.push(result);
          break;
        }
        case 'GL_NOT_PERMITTED':
          a.notPermitted++;
          if (state !== 'open')
            v['breaker'].push(`event ${i}: call refused while the breaker was ${state}`);
          if (cur)
            v['structure'].push(`event ${i}: GL_NOT_PERMITTED inside the publish of ${cur.id}`);
          publishEnd(id, e.source ?? '', false, e.tick);
          cur = null;
          break;
        case 'PUBLISH_OK':
        case 'PUBLISH_FAILED': {
          const ok = e.code === 'PUBLISH_OK';
          if (!cur || cur.id !== id || cur.source !== e.source) {
            v['structure'].push(`event ${i}: ${e.code} for ${id} without its attempts`);
            cur = null;
            break;
          }
          const r = cur.results;
          const last = r[r.length - 1];
          if (ok && !SUCCESS.has(last))
            v['attempts'].push(`event ${i}: ${id} reported OK after ${last}`);
          if (!ok && (r.length !== ATTEMPTS || r.some((x) => SUCCESS.has(x)))) {
            v['attempts'].push(
              `event ${i}: ${id} failed after ${r.length} attempt(s) [${r.join(', ')}], needs ${ATTEMPTS} failing attempts`,
            );
          }
          // The breaker records one outcome per publish, after the retries (retry is inside the breaker).
          if (state === 'closed') {
            window.push(ok);
            if (window.length > WINDOW) window.shift();
            const failures = window.filter((x) => !x).length;
            if (window.length >= MIN_CALLS && failures * 100 >= FAILURE_PERCENT * window.length)
              pending = 'open';
          } else if (state === 'half-open') {
            a.halfOpenPublishes++;
            if (!ok) a.halfOpenFailed.push(r.length);
            probes.push(ok);
            if (probes.length === PROBES) {
              const failures = probes.filter((x) => !x).length;
              pending = failures * 100 >= FAILURE_PERCENT * PROBES ? 'open' : 'closed';
            }
          }
          publishEnd(id, cur.source, ok, e.tick);
          cur = null;
          break;
        }
        case 'BREAKER_OPEN':
          if (pending !== 'open')
            v['breaker'].push(
              `event ${i}: BREAKER_OPEN without the failure threshold being reached`,
            );
          state = 'open';
          window = [];
          probes = [];
          pending = null;
          a.opens++;
          break;
        case 'BREAKER_HALF_OPEN':
          if (state !== 'open') v['breaker'].push(`event ${i}: BREAKER_HALF_OPEN from ${state}`);
          state = 'half-open';
          probes = [];
          break;
        case 'BREAKER_CLOSED':
          if (state !== 'half-open' || pending !== 'closed')
            v['breaker'].push(`event ${i}: BREAKER_CLOSED from ${state}, only half-open may close`);
          state = 'closed';
          window = [];
          probes = [];
          pending = null;
          break;
        case 'OUTBOX_ENQUEUED':
          if (!failedDirect.has(id))
            v['outbox'].push(
              `event ${i}: ${id} entered the outbox without a failed direct publish`,
            );
          failedDirect.delete(id);
          outbox.push(id);
          a.outboxPeak = Math.max(a.outboxPeak, outbox.length);
          break;
        case 'OUTBOX_DELIVERED':
          if (pendingDeliver !== id)
            v['outbox'].push(`event ${i}: ${id} delivered without a successful relay publish`);
          if (outbox[0] !== id)
            v['outbox'].push(`event ${i}: ${id} delivered but the head is ${outbox[0]}`);
          else outbox.shift();
          pendingDeliver = null;
          break;
        default:
          break;
      }
    }
    const s = step;
    if (outbox.length !== s.outboxDepth)
      v['outbox'].push(
        `tick ${s.tick}: outbox depth ${s.outboxDepth}, events say ${outbox.length}`,
      );
    if (stored.size !== s.glKeys)
      v['generalLedger'].push(
        `tick ${s.tick}: general ledger holds ${s.glKeys} entries, events say ${stored.size}`,
      );
  }
  if (pending !== null) v['breaker'].push(`the run ended before the breaker went ${pending}`);
  if (cur) v['structure'].push(`the run ended inside the publish of ${cur.id}`);
  if (failedDirect.size > 0)
    v['outbox'].push(
      `failed direct publishes never entered the outbox: ${[...failedDirect].slice(0, 3).join(', ')}`,
    );
  if (done) {
    if (directDone.size !== posted.size)
      v['direct'].push(`${posted.size} postings but ${directDone.size} direct publishes`);
    if (outbox.length !== 0) v['outbox'].push(`the outbox still holds ${outbox.length}`);
  }
  a.maxDirectPerTick = Math.max(0, ...directPerTick.values());
  a.maxRelayPerTick = Math.max(0, ...relayPerTick.values());
  return a;
}

const audits = new Map<string, Audit>();
const auditOf = (mode: Mode, fault: Fault, seed: number): Audit => {
  const key = `${mode}/${fault}/${seed}`;
  let r = audits.get(key);
  if (!r) {
    r = audit(play(mode, fault, seed));
    audits.set(key, r);
  }
  return r;
};

function violationsOf(mode: Mode, fault: Fault, rule: string): string[] {
  return SEEDS.flatMap((seed) =>
    auditOf(mode, fault, seed).v[rule].map((m) => `seed ${seed}: ${m}`),
  ).slice(0, 5);
}

// ---------------------------------------------------------------------------------------------------------
// Hand-built records for the pure checker

const P = (
  sequence: number,
  transferId: string,
  from: number,
  to: number,
  amount: number,
): Posting => ({ sequence, transferId, from, to, amount }) as Posting;

/** Opening [100, 100, 100]; t1: 0 to 1 for 30, t2: 1 to 2 for 10. Everything consistent. */
function base(): RunRecord {
  const p1 = P(1, 't1', 0, 1, 30);
  const p2 = P(2, 't2', 1, 2, 10);
  return {
    openingTotal: 300,
    openingBalances: [100, 100, 100],
    balances: [70, 120, 110],
    postings: [p1, p2],
    acceptedIds: ['t1', 't2'],
    generalLedger: { t1: p1, t2: p2 },
  } as unknown as RunRecord;
}
const patch = (over: Record<string, unknown>): RunRecord =>
  ({ ...(base() as object), ...over }) as unknown as RunRecord;
const verdict = (r: RunRecord) => checkInvariants(r) as Record<Name, boolean>;

describe('REQ-PROJ-103 checkInvariants on hand-built records', () => {
  it('REQ-PROJ-103 a consistent record passes all six', () => {
    expect(checkInvariants(base())).toEqual(ALL_TRUE);
    expect(oracle(base())).toEqual(ALL_TRUE);
  });

  it('REQ-PROJ-103 the six names are exactly those of settlement-lab Invariant', () => {
    expect(Object.keys(verdict(base())).sort()).toEqual([...NAMES].sort());
  });

  // One mutation per invariant; each lists the exact set of checks that must fail (InvariantChecker semantics).
  const mutations: { name: string; record: RunRecord; failed: Name[] }[] = [
    {
      name: 'TOTAL_CONSERVED: money appears in an account (postings no longer explain it either)',
      record: patch({ balances: [70, 125, 110] }),
      failed: ['TOTAL_CONSERVED', 'POSTINGS_EXPLAIN_BALANCES'],
    },
    {
      name: 'NO_NEGATIVE_BALANCE: an overdraft that the postings and the total still explain',
      record: patch({
        openingBalances: [10, 10, 10],
        openingTotal: 30,
        balances: [-5, 25, 10],
        postings: [P(1, 't1', 0, 1, 15)],
        acceptedIds: ['t1'],
        generalLedger: { t1: P(1, 't1', 0, 1, 15) },
      }),
      failed: ['NO_NEGATIVE_BALANCE'],
    },
    {
      name: 'POSTED_AT_MOST_ONCE: the same transfer id posted twice',
      record: patch({
        openingBalances: [100, 100, 100],
        balances: [40, 160, 100],
        postings: [P(1, 't1', 0, 1, 30), P(2, 't1', 0, 1, 30)],
        acceptedIds: ['t1'],
        generalLedger: { t1: P(2, 't1', 0, 1, 30) },
      }),
      failed: ['POSTED_AT_MOST_ONCE'],
    },
    {
      name: 'POSTINGS_EXPLAIN_BALANCES: balances moved with no posting, total unchanged',
      record: patch({ balances: [60, 130, 110] }),
      failed: ['POSTINGS_EXPLAIN_BALANCES'],
    },
    {
      name: 'POSTINGS_MATCH_ACCEPTED: accepted but never posted',
      record: patch({ acceptedIds: ['t1', 't2', 't3'] }),
      failed: ['POSTINGS_MATCH_ACCEPTED'],
    },
    {
      name: 'GL_MATCHES_POSTINGS: a posting missing from the general ledger',
      record: patch({ generalLedger: { t1: P(1, 't1', 0, 1, 30) } }),
      failed: ['GL_MATCHES_POSTINGS'],
    },
  ];

  for (const m of mutations) {
    it(`REQ-PROJ-103 mutation ${m.name} fails exactly ${m.failed.join(' + ')}`, () => {
      const got = verdict(m.record);
      expect(failing(got).sort()).toEqual([...m.failed].sort());
      expect(got).toEqual(oracle(m.record));
    });
  }

  it('REQ-PROJ-103 a double posting keeps TOTAL_CONSERVED; only POSTED_AT_MOST_ONCE catches it (KNOWN-ERRORS W14)', () => {
    const r = mutations[2].record;
    const got = verdict(r);

    expect(got.TOTAL_CONSERVED).toBe(true);
    expect(got.POSTINGS_EXPLAIN_BALANCES).toBe(true);
    expect(got.POSTED_AT_MOST_ONCE).toBe(false);
  });

  it('REQ-PROJ-103 posted but not accepted fails POSTINGS_MATCH_ACCEPTED: accepted ids are the callers outcomes, not the postings (W11)', () => {
    const r = patch({ acceptedIds: ['t1'] }); // t2 was posted, its caller never got POSTED

    expect(verdict(r).POSTINGS_MATCH_ACCEPTED).toBe(false);
    expect(failing(verdict(r))).toEqual(['POSTINGS_MATCH_ACCEPTED']);
  });

  it('REQ-PROJ-103 POSTINGS_MATCH_ACCEPTED compares id sets, not counts', () => {
    // same count (2 and 2), different ids
    const r = patch({ acceptedIds: ['t1', 't9'] });

    expect(verdict(r).POSTINGS_MATCH_ACCEPTED).toBe(false);
  });

  it('REQ-PROJ-103 GL_MATCHES_POSTINGS is by transfer id, so entry order does not matter, but a different entry does (W11)', () => {
    const p1 = P(1, 't1', 0, 1, 30);
    const p2 = P(2, 't2', 1, 2, 10);
    const reordered = patch({ generalLedger: { t2: p2, t1: p1 } });
    const differing = patch({ generalLedger: { t1: P(1, 't1', 0, 1, 31), t2: p2 } });
    const extra = patch({ generalLedger: { t1: p1, t2: p2, t3: P(3, 't3', 0, 2, 1) } });

    expect(verdict(reordered).GL_MATCHES_POSTINGS).toBe(true);
    expect(verdict(differing).GL_MATCHES_POSTINGS).toBe(false);
    expect(verdict(extra).GL_MATCHES_POSTINGS).toBe(false);
  });

  it('REQ-PROJ-103 the checker equals the independent port on every mutation and on random records', () => {
    const rng = (() => {
      let s = 12_345;
      return () => (s = (Math.imul(s, 1_103_515_245) + 12_345) >>> 0) / 4_294_967_296;
    })();
    for (let n = 0; n < 400; n++) {
      const accounts = 3;
      const opening = Array.from({ length: accounts }, () => 50 + Math.floor(rng() * 50));
      const postings: Posting[] = [];
      const count = Math.floor(rng() * 5);
      for (let k = 0; k < count; k++) {
        const from = Math.floor(rng() * accounts);
        const to = (from + 1 + Math.floor(rng() * (accounts - 1))) % accounts;
        const id = rng() < 0.2 && postings.length ? postings[0].transferId : `t${k}`;
        postings.push(P(k + 1, id, from, to, 1 + Math.floor(rng() * 30)));
      }
      const balances = [...opening];
      postings.forEach((p) => {
        balances[p.from] -= p.amount;
        balances[p.to] += p.amount;
      });
      if (rng() < 0.3) balances[0] += Math.floor(rng() * 5) - 2;
      const accepted = postings.map((p) => p.transferId).filter(() => rng() < 0.9);
      if (rng() < 0.2) accepted.push('zz');
      const gl: Record<string, Posting> = {};
      postings.forEach((p) => {
        if (rng() < 0.9)
          gl[p.transferId] =
            rng() < 0.9 ? p : P(p.sequence, p.transferId, p.from, p.to, p.amount + 1);
      });
      const r = {
        openingTotal: sum(opening),
        openingBalances: opening,
        balances,
        postings,
        acceptedIds: accepted,
        generalLedger: gl,
      } as unknown as RunRecord;

      expect(checkInvariants(r), JSON.stringify(r)).toEqual(oracle(r));
    }
  });

  it('REQ-PROJ-103 a run that never finished is not evaluated, a finished one is', () => {
    expect(
      checkInvariants({ ...(base() as object), end: 'deadlock' } as unknown as RunRecord),
    ).toBe('not-evaluated');
    expect(checkInvariants({ ...(base() as object), end: 'timeout' } as unknown as RunRecord)).toBe(
      'not-evaluated',
    );
    expect(checkInvariants({ ...(base() as object), end: 'done' } as unknown as RunRecord)).toEqual(
      ALL_TRUE,
    );
  });

  it('REQ-ACC-003 checkInvariants does not mutate its input and gives the same answer twice', () => {
    const r = mutations[2].record;
    const before = JSON.stringify(r);

    expect(checkInvariants(r)).toEqual(checkInvariants(r));
    expect(JSON.stringify(r)).toBe(before);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Safe modes: ordered locking and CAS

describe.each(SAFE.flatMap((mode) => FAULTS.map((fault) => ({ mode, fault }))))(
  'REQ-PROJ-103 $mode with fault $fault, 30 seeds',
  ({ mode, fault }) => {
    it(
      'REQ-PROJ-103 ends done with all six invariants true, an empty outbox and no deadlock cycle',
      () => {
        const bad = badSeeds(mode, fault, (t) => {
          const r = checkInvariants(t.sim.runRecord);
          return (
            t.fin.end === 'done' &&
            JSON.stringify(r) === JSON.stringify(ALL_TRUE) &&
            t.fin.outboxDepth === 0 &&
            t.fin.cycle.length === 0
          );
        });

        expect(bad).toEqual([]);
      },
      T,
    );

    it(
      'REQ-PROJ-103 total is conserved and no balance is negative at every tick',
      () => {
        const bad = badSeeds(mode, fault, (t) => {
          const opening = sum(t.fin.openingBalances);
          return t.steps.every((s) => s.total === opening && s.min >= 0);
        });

        expect(bad).toEqual([]);
      },
      T,
    );

    it('REQ-PROJ-103 the model is flagged safe (unsafe is false)', () => {
      expect(play(mode, fault, SEEDS[0]).fin.unsafe).toBe(false);
    });

    it(
      'REQ-PROJ-103 the outbox drains: it is empty at the end and the general ledger holds exactly the postings',
      () => {
        const bad = badSeeds(mode, fault, (t) => {
          const postedIds = t.fin.postings.map((p: Posting) => p.transferId).sort();
          const glIds = Object.keys(t.fin.generalLedger).sort();
          return (
            t.fin.end === 'done' &&
            t.fin.outboxDepth === 0 &&
            JSON.stringify(postedIds) === JSON.stringify(glIds)
          );
        });

        expect(bad).toEqual([]);
      },
      T,
    );
  },
);

describe('REQ-PROJ-103 what each safe mode counts (KNOWN-ERRORS M6)', () => {
  it(
    'REQ-PROJ-103 ordered locking has lock waits and never a CAS conflict; locks are really held',
    () => {
      const runs = SEEDS.map((s) => play('ordered', 'none', s));

      expect(runs.every((t) => t.fin.casConflicts === 0)).toBe(true);
      expect(sum(runs.map((t) => t.fin.lockWaits))).toBeGreaterThan(0);
      expect(runs.some((t) => t.steps.some((s) => s.held > 0))).toBe(true);
    },
    T,
  );

  it(
    'REQ-PROJ-103 CAS has conflicts and never a lock wait or a held lock',
    () => {
      const runs = SEEDS.map((s) => play('cas', 'none', s));

      expect(runs.every((t) => t.fin.lockWaits === 0 && t.steps.every((s) => s.held === 0))).toBe(
        true,
      );
      expect(sum(runs.map((t) => t.fin.casConflicts))).toBeGreaterThan(0);
    },
    T,
  );
});

// ---------------------------------------------------------------------------------------------------------
// Unordered locking: deadlocks

describe.each(FAULTS)('REQ-PROJ-103 unordered locking deadlocks, fault %s, 30 seeds', (fault) => {
  it(
    'REQ-PROJ-103 every seed ends deadlock, flagged unsafe, with invariants not evaluated (I11)',
    () => {
      const bad = badSeeds(
        'unordered',
        fault,
        (t) =>
          t.fin.end === 'deadlock' &&
          t.fin.unsafe === true &&
          checkInvariants(t.sim.runRecord) === 'not-evaluated',
      );

      expect(bad).toEqual([]);
    },
    T,
  );

  it(
    'REQ-PROJ-103 the reported cycle is a real lock cycle: each worker holds an account the previous one needs',
    () => {
      const problems = SEEDS.flatMap((seed) => {
        const s = play('unordered', fault, seed).fin;
        const c = [...s.cycle];
        const out: string[] = [];
        if (c.length < 2) out.push('cycle shorter than 2');
        if (new Set(c).size !== c.length) out.push('a worker appears twice');
        if (c.some((w) => !Number.isInteger(w) || w < 0 || w >= 8))
          out.push('worker index out of range');
        if (out.length === 0) {
          c.forEach((w, i) => {
            const next = c[(i + 1) % c.length];
            const needsFromNext = s.workers[w].accounts.filter(
              (acc: number) => s.locks[acc] === next,
            );
            if (needsFromNext.length === 0)
              out.push(`worker ${w} needs nothing that worker ${next} holds`);
          });
        }
        return out.map((m) => `seed ${seed}: ${m}`);
      });

      expect(problems.slice(0, 5)).toEqual([]);
    },
    T,
  );

  it(
    'REQ-PROJ-103 the run stops: DEADLOCK_DETECTED once, no NO_DEADLOCK_THIS_TIME, and step() changes nothing',
    () => {
      const bad = SEEDS.filter((seed) => {
        const t = play('unordered', fault, seed);
        const codes = evs(t.sim).map((e) => e.code);
        const tick = t.sim.snapshot.tick;
        const count = t.sim.events.length;
        t.sim.step();
        return (
          codes.filter((c) => c === 'DEADLOCK_DETECTED').length !== 1 ||
          codes.includes('NO_DEADLOCK_THIS_TIME') ||
          t.sim.snapshot.tick !== tick ||
          t.sim.events.length !== count
        );
      });

      expect(bad).toEqual([]);
    },
    T,
  );
});

describe('REQ-PROJ-103 an unordered run that finishes says so (KNOWN-ERRORS M12)', () => {
  it(
    'REQ-PROJ-103 a searched seed finishes: end done, event NO_DEADLOCK_THIS_TIME, all six invariants true, no cycle',
    () => {
      let found: SettlementSim | null = null;
      let seedFound = -1;
      for (let seed = 1; seed <= 2_000 && !found; seed++) {
        const sim = new SettlementSim({ mode: 'unordered', fault: 'none', seed });
        let n = 0;
        while (sim.snapshot.end === '' && n++ < MAX_STEPS) sim.step();
        if (sim.snapshot.end !== 'deadlock') {
          found = sim;
          seedFound = seed;
        }
      }

      expect(
        found,
        'no seed in 1..2000 finished without a deadlock (the blueprint model finished 25 of 2,000)',
      ).not.toBeNull();
      const sim = found as unknown as SettlementSim;
      expect(sim.snapshot.end, `seed ${seedFound}`).toBe('done');
      expect(sim.snapshot.cycle).toEqual([]);
      expect(evs(sim).filter((e) => e.code === 'NO_DEADLOCK_THIS_TIME')).toHaveLength(1);
      expect(evs(sim).some((e) => e.code === 'DEADLOCK_DETECTED')).toBe(false);
      expect(checkInvariants(sim.runRecord)).toEqual(ALL_TRUE);
      expect(sim.snapshot.unsafe).toBe(true);
    },
    T,
  );

  it(
    'REQ-PROJ-103 only an unordered run emits NO_DEADLOCK_THIS_TIME',
    () => {
      const codes = (m: Mode) => evs(play(m, 'none', SEEDS[0]).sim).map((e) => e.code);

      expect(codes('ordered')).not.toContain('NO_DEADLOCK_THIS_TIME');
      expect(codes('cas')).not.toContain('NO_DEADLOCK_THIS_TIME');
      expect(codes('unsynchronised')).not.toContain('NO_DEADLOCK_THIS_TIME');
    },
    T,
  );
});

// ---------------------------------------------------------------------------------------------------------
// Unsynchronised: lost updates

describe.each(FAULTS)('REQ-PROJ-103 unsynchronised, fault %s, 30 seeds', (fault) => {
  it(
    'REQ-PROJ-103 every seed finishes, flagged unsafe, and the checker equals the independent port (exact failing set)',
    () => {
      const bad = badSeeds('unsynchronised', fault, (t) => {
        const r = t.sim.runRecord;
        return (
          t.fin.end === 'done' &&
          t.fin.unsafe === true &&
          JSON.stringify(checkInvariants(r)) === JSON.stringify(oracle(r))
        );
      });

      expect(bad).toEqual([]);
    },
    T,
  );

  it(
    'REQ-PROJ-103 POSTINGS_EXPLAIN_BALANCES fails on every seed and TOTAL_CONSERVED fails on these seeds',
    () => {
      const bad = SEEDS.filter((seed) => {
        const f = oracle(play('unsynchronised', fault, seed).sim.runRecord);
        return f.POSTINGS_EXPLAIN_BALANCES || f.TOTAL_CONSERVED;
      });

      expect(bad).toEqual([]);
    },
    T,
  );

  it(
    'REQ-PROJ-103 the failing set is what the independent checker says, check by check, never a bare "total" verdict (W14)',
    () => {
      const bad = SEEDS.filter((seed) => {
        const r = play('unsynchronised', fault, seed).sim.runRecord;
        const got = checkInvariants(r) as Record<Name, boolean>;
        const want = oracle(r);
        return NAMES.some((n) => got[n] !== want[n]) || failing(got).length === 0;
      });

      expect(bad).toEqual([]);
    },
    T,
  );
});

describe('REQ-PROJ-103 the six checks equal the independent port on every finished run', () => {
  it(
    'REQ-PROJ-103 all 360 runs: finished runs equal the oracle, unfinished runs are not evaluated',
    () => {
      const bad: string[] = [];
      for (const mode of ALL) {
        for (const fault of FAULTS) {
          for (const seed of SEEDS) {
            const t = play(mode, fault, seed);
            const got = checkInvariants(t.sim.runRecord);
            const unfinished = t.fin.end === 'deadlock' || t.fin.end === 'timeout';
            const ok = unfinished
              ? got === 'not-evaluated'
              : got !== 'not-evaluated' &&
                JSON.stringify(got) === JSON.stringify(oracle(t.sim.runRecord));
            if (!ok) bad.push(`${mode}/${fault}/${seed}`);
          }
        }
      }

      expect(bad).toEqual([]);
    },
    T,
  );

  it(
    'REQ-PROJ-103 accepted ids are the POSTED outcomes of the callers, not read back from postings (W11)',
    () => {
      const bad = SEEDS.filter((seed) => {
        const t = play('ordered', 'flaky', seed);
        const fromEvents = evs(t.sim)
          .filter((e) => e.code === 'POSTED')
          .map((e) => e.transferId)
          .sort();
        const rejected = new Set(
          evs(t.sim)
            .filter((e) => e.code === 'REJECTED_FUNDS')
            .map((e) => e.transferId),
        );
        const accepted = [...t.sim.runRecord.acceptedIds].sort();
        return (
          JSON.stringify(accepted) !== JSON.stringify(fromEvents) ||
          accepted.some((id) => rejected.has(id))
        );
      });

      expect(bad).toEqual([]);
    },
    T,
  );

  it(
    'REQ-PROJ-103 openingTotal is the sum of the opening balances and postings carry a sequence 1..n, from != to, amount > 0',
    () => {
      const bad = SEEDS.filter((seed) => {
        const t = play('cas', 'none', seed);
        const r = t.sim.runRecord;
        const ps = [...r.postings] as Posting[];
        return (
          r.openingTotal !== sum(r.openingBalances) ||
          ps.some((p, i) => p.sequence !== i + 1 || p.from === p.to || !(p.amount > 0)) ||
          ps.length === 0
        );
      });

      expect(bad).toEqual([]);
    },
    T,
  );
});

// ---------------------------------------------------------------------------------------------------------
// Transfers, queue, duplicates, rejections (all modes that finish)

const FINISHING: { mode: Mode; fault: Fault }[] = [...SAFE, 'unsynchronised' as Mode].flatMap(
  (mode) => FAULTS.map((fault) => ({ mode, fault })),
);

describe.each(FINISHING)(
  'REQ-PROJ-103 workload, queue and duplicates: $mode, fault $fault',
  ({ mode, fault }) => {
    it(
      'REQ-PROJ-103 600 distinct transfers: each is queued once and gets exactly one outcome',
      () => {
        const bad = badSeeds(mode, fault, (t) => {
          const events = evs(t.sim);
          const queued = events.filter((e) => e.code === 'QUEUED').map((e) => e.transferId);
          const outcomes = events
            .filter((e) => e.code === 'POSTED' || e.code === 'REJECTED_FUNDS')
            .map((e) => e.transferId);
          return (
            new Set(queued).size === TRANSFERS &&
            queued.length === TRANSFERS &&
            new Set(outcomes).size === TRANSFERS &&
            outcomes.length === TRANSFERS
          );
        });

        expect(bad).toEqual([]);
      },
      T,
    );

    it(
      'REQ-PROJ-103 every seed rejects some transfers for funds (I9), and rejected + posted = 600',
      () => {
        const bad = badSeeds(mode, fault, (t) => {
          const events = evs(t.sim);
          const rejected = events.filter((e) => e.code === 'REJECTED_FUNDS').length;
          return (
            rejected > 0 &&
            t.fin.rejected === rejected &&
            t.fin.postings.length === TRANSFERS - rejected
          );
        });

        expect(bad).toEqual([]);
      },
      T,
    );

    it(
      'REQ-PROJ-103 the queue never exceeds 64 and its capacity is 64',
      () => {
        const bad = badSeeds(mode, fault, (t) =>
          t.steps.every(
            (s) => s.queueCapacity === QUEUE && s.queueDepth >= 0 && s.queueDepth <= QUEUE,
          ),
        );

        expect(bad).toEqual([]);
      },
      T,
    );

    it(
      'REQ-PROJ-103 duplicates are answered before the queue: none is queued, each returns the original outcome and posts nothing (W12)',
      () => {
        const bad = badSeeds(mode, fault, (t) => {
          const events = evs(t.sim);
          const firstOutcome = new Map<string, { index: number; code: string }>();
          events.forEach((e, index) => {
            if (
              (e.code === 'POSTED' || e.code === 'REJECTED_FUNDS') &&
              !firstOutcome.has(e.transferId ?? '')
            ) {
              firstOutcome.set(e.transferId ?? '', { index, code: e.code });
            }
          });
          const dups = events
            .map((e, index) => ({ e, index }))
            .filter(({ e }) => e.code === 'DUPLICATE_ANSWERED');
          const queuedOnce = events.filter((e) => e.code === 'QUEUED').length === TRANSFERS;
          const postedPerId =
            events.filter((e) => e.code === 'POSTED').length ===
            new Set(events.filter((e) => e.code === 'POSTED').map((e) => e.transferId)).size;
          return (
            dups.length > 0 &&
            t.fin.duplicatesAnswered === dups.length &&
            queuedOnce &&
            postedPerId &&
            dups.every(({ e, index }) => {
              const o = firstOutcome.get(e.transferId ?? '');
              return o !== undefined && o.index < index && e.outcome === o.code;
            })
          );
        });

        expect(bad).toEqual([]);
      },
      T,
    );

    it(
      'REQ-PROJ-103 a duplicate of a rejected transfer is answered rejected and posts nothing',
      () => {
        const answered = SEEDS.flatMap((seed) => {
          const events = evs(play(mode, fault, seed).sim);
          const rejected = new Set(
            events.filter((e) => e.code === 'REJECTED_FUNDS').map((e) => e.transferId),
          );
          const posted = new Set(
            events.filter((e) => e.code === 'POSTED').map((e) => e.transferId),
          );
          return events
            .filter((e) => e.code === 'DUPLICATE_ANSWERED' && rejected.has(e.transferId))
            .map((e) => ({ e, post: posted.has(e.transferId ?? '') }));
        });

        // Whether any of the seeds repeats a rejected id is workload luck; where it does, the rules hold.
        expect(answered.every(({ e, post }) => e.outcome === 'REJECTED_FUNDS' && !post)).toBe(true);
      },
      T,
    );
  },
);

// ---------------------------------------------------------------------------------------------------------
// General ledger: direct publish, retry inside breaker, breaker, outbox, faults. Every mode that finishes or not.

const PUBLISHING = ALL.flatMap((mode) => FAULTS.map((fault) => ({ mode, fault })));

describe.each(PUBLISHING)(
  'REQ-PROJ-103 general ledger publishing: $mode, fault $fault',
  ({ mode, fault }) => {
    it(
      'REQ-PROJ-103 a publish makes at most 3 attempts in total, retries only after a failure, and a failed publish used all 3 (W10)',
      () => {
        expect(violationsOf(mode, fault, 'attempts')).toEqual([]);
        expect(violationsOf(mode, fault, 'structure')).toEqual([]);
      },
      T,
    );

    it(
      'REQ-PROJ-103 the breaker records one outcome per publish after the retries: window 20, min 10 calls, 50 %, 3 half-open probes (W10)',
      () => {
        expect(violationsOf(mode, fault, 'breaker')).toEqual([]);
      },
      T,
    );

    it(
      'REQ-PROJ-103 the breaker is never seen going open to closed; every close passes half-open for at least one step (W9)',
      () => {
        const bad = badSeeds(mode, fault, (t) => {
          const states = ['closed', ...t.steps.map((s) => s.breaker)];
          const legal: Record<string, string[]> = {
            closed: ['closed', 'open'],
            open: ['open', 'half-open'],
            'half-open': ['half-open', 'open', 'closed'],
          };
          return states.every((s, i) => i === 0 || legal[states[i - 1]].includes(s));
        });

        expect(bad).toEqual([]);
      },
      T,
    );

    it(
      'REQ-PROJ-103 opens counts every transition to open, also from half-open, and retries counts attempts after the first (W9)',
      () => {
        const bad = badSeeds(mode, fault, (t) => {
          const states = ['closed', ...t.steps.map((s) => s.breaker)];
          const toOpen = states.filter(
            (s, i) => i > 0 && s === 'open' && states[i - 1] !== 'open',
          ).length;
          const events = evs(t.sim);
          const attemptsAfterFirst = events.filter(
            (e) => e.code === 'GL_ATTEMPT' && (e.attempt ?? 0) > 1,
          ).length;
          return (
            t.fin.opens === toOpen &&
            events.filter((e) => e.code === 'BREAKER_OPEN').length === toOpen &&
            t.fin.retries === attemptsAfterFirst
          );
        });

        expect(bad).toEqual([]);
      },
      T,
    );

    it(
      'REQ-PROJ-103 each posting is published directly first (at most 16 senders a tick); only a failed publish enters the outbox (M4)',
      () => {
        expect(violationsOf(mode, fault, 'direct')).toEqual([]);
        expect(violationsOf(mode, fault, 'outbox')).toEqual([]);
        const maxDirect = Math.max(...SEEDS.map((s) => auditOf(mode, fault, s).maxDirectPerTick));

        expect(maxDirect).toBeLessThanOrEqual(SENDERS);
      },
      T,
    );

    it(
      'REQ-PROJ-103 one relay retries the head of the outbox, at most one publish a tick (M4)',
      () => {
        expect(violationsOf(mode, fault, 'relay')).toEqual([]);
        const maxRelay = Math.max(...SEEDS.map((s) => auditOf(mode, fault, s).maxRelayPerTick));

        expect(maxRelay).toBeLessThanOrEqual(1);
      },
      T,
    );

    it(
      'REQ-PROJ-103 the general ledger is a map by transfer id: a repeat publish adds no entry and is never RECORDED twice',
      () => {
        expect(violationsOf(mode, fault, 'generalLedger')).toEqual([]);
      },
      T,
    );
  },
);

describe('REQ-PROJ-103 fault profiles (FaultProfile NONE, FLAKY, outage)', () => {
  it(
    'REQ-PROJ-103 fault none: every attempt is RECORDED at once, no retry, no outbox, breaker never opens',
    () => {
      for (const mode of SAFE) {
        const runs = SEEDS.map((s) => ({ a: auditOf(mode, 'none', s), t: play(mode, 'none', s) }));

        expect(runs.every(({ a }) => a.results.size === 1 && a.results.has('RECORDED'))).toBe(true);
        expect(
          runs.every(
            ({ a, t }) =>
              a.retries === 0 &&
              t.fin.retries === 0 &&
              t.fin.opens === 0 &&
              a.outboxPeak === 0 &&
              a.notPermitted === 0,
          ),
        ).toBe(true);
      }
    },
    T,
  );

  it(
    'REQ-PROJ-103 flaky is 10 % errors and 5 % recorded-but-ack-lost (fresh calls, ordered and CAS, 60 runs)',
    () => {
      const total = { n: 0, error: 0, lost: 0 };
      for (const mode of SAFE) {
        for (const seed of SEEDS) {
          const f = auditOf(mode, 'flaky', seed).fresh;
          total.n += f.total;
          total.error += f.error;
          total.lost += f.lost;
        }
      }

      expect(total.n).toBeGreaterThan(30_000);
      expect(total.error / total.n).toBeGreaterThan(0.085);
      expect(total.error / total.n).toBeLessThan(0.115);
      expect(total.lost / total.n).toBeGreaterThan(0.035);
      expect(total.lost / total.n).toBeLessThan(0.065);
    },
    T,
  );

  it(
    'REQ-PROJ-103 flaky never reports an outage result, and outage never reports an error or lost ack',
    () => {
      for (const seed of SEEDS) {
        expect(auditOf('ordered', 'flaky', seed).results.has('OUTAGE')).toBe(false);
        const r = auditOf('ordered', 'outage', seed).results;
        expect([...r].every((x) => x === 'RECORDED' || x === 'OUTAGE')).toBe(true);
      }
    },
    T,
  );

  it(
    'REQ-PROJ-103 the retry of a lost ack is answered ALREADY_RECORDED and adds no general ledger entry',
    () => {
      const lostThenAlready = SAFE.flatMap((m) =>
        SEEDS.map((s) => auditOf(m, 'flaky', s).ackLostThenAlready),
      );
      const lostAcks = SAFE.flatMap((m) => SEEDS.map((s) => auditOf(m, 'flaky', s).fresh.lost));

      expect(sum(lostAcks)).toBeGreaterThan(0);
      expect(sum(lostThenAlready)).toBeGreaterThan(0);
      // a retry that found the entry stored never grew the ledger: checked per tick by the audit (entry count == stored ids)
      expect(SAFE.flatMap((m) => violationsOf(m, 'flaky', 'generalLedger'))).toEqual([]);
    },
    T,
  );

  it(
    'REQ-PROJ-103 outage: calls fail inside one window, the breaker opens, goes half-open, closes, and the outbox drains',
    () => {
      const bad: string[] = [];
      for (const mode of SAFE) {
        for (const seed of SEEDS) {
          const a = auditOf(mode, 'outage', seed);
          const t = play(mode, 'outage', seed);
          const w = a.outageTicks;
          const states = t.steps.map((s) => s.breaker);
          const ok =
            t.fin.end === 'done' &&
            t.fin.opens >= 1 &&
            states.includes('half-open') &&
            states[states.length - 1] === 'closed' &&
            a.outboxPeak > 0 &&
            t.fin.outboxDepth === 0 &&
            w !== null &&
            !a.recordedTicks.some((tick) => tick > w.first && tick < w.last);
          if (!ok) bad.push(`${mode}/${seed}`);
        }
      }

      expect(bad).toEqual([]);
    },
    T,
  );

  it(
    'REQ-PROJ-103 outage: calls are refused while open, retry also runs in half-open, direct publishes continue while older entries wait',
    () => {
      const runs = SAFE.flatMap((m) => SEEDS.map((s) => auditOf(m, 'outage', s)));

      expect(sum(runs.map((a) => a.notPermitted))).toBeGreaterThan(0);
      expect(sum(runs.map((a) => a.halfOpenPublishes))).toBeGreaterThan(0);
      expect(sum(runs.map((a) => a.directWhileOutbox))).toBeGreaterThan(0);
    },
    T,
  );
});

// ---------------------------------------------------------------------------------------------------------
// Purity (REQ-ACC-003)

describe('REQ-ACC-003 pure, seeded model', () => {
  const trace = (mode: Mode, fault: Fault, seed: number) => {
    const sim = new SettlementSim({ mode, fault, seed });
    const snaps: string[] = [];
    let n = 0;
    while (sim.snapshot.end === '' && n++ < MAX_STEPS) {
      sim.step();
      if (n % 25 === 0) snaps.push(JSON.stringify(sim.snapshot));
    }
    return { events: JSON.stringify(evs(sim)), snaps, fin: JSON.stringify(sim.snapshot) };
  };

  it(
    'REQ-ACC-003 the same seed gives the same trace, event for event and snapshot for snapshot',
    () => {
      for (const [mode, fault] of [
        ['cas', 'flaky'],
        ['ordered', 'outage'],
        ['unsynchronised', 'flaky'],
        ['unordered', 'none'],
      ] as [Mode, Fault][]) {
        expect(trace(mode, fault, 7)).toEqual(trace(mode, fault, 7));
      }
    },
    T,
  );

  it(
    'REQ-ACC-003 a different seed gives a different trace',
    () => {
      expect(trace('ordered', 'flaky', 1).events).not.toEqual(trace('ordered', 'flaky', 2).events);
      expect(trace('cas', 'none', 1).fin).not.toEqual(trace('cas', 'none', 2).fin);
    },
    T,
  );

  it('REQ-ACC-003 a snapshot is a plain copy: changing it never changes the model', () => {
    const sim = new SettlementSim({ mode: 'ordered', fault: 'none', seed: 3 });
    for (let i = 0; i < 40; i++) sim.step();
    const before = JSON.stringify(sim.snapshot);
    const s = sim.snapshot as unknown as {
      balances: number[];
      postings: unknown[];
      workers: unknown[];
      tick: number;
      generalLedger: Record<string, unknown>;
    };
    s.balances[0] = -999;
    s.balances.push(1);
    s.postings.push({});
    s.workers.length = 0;
    s.generalLedger['x'] = {};
    s.tick = 12_345;

    expect(JSON.stringify(sim.snapshot)).toBe(before);
    expect(JSON.parse(JSON.stringify(sim.snapshot))).toEqual(sim.snapshot);
    expect(sim.snapshot.workers).toHaveLength(8);
  });

  it('REQ-ACC-003 the first snapshot is at rest: tick 0, not ended, 8 idle workers, an empty queue and no postings', () => {
    const s = new SettlementSim({ mode: 'cas', fault: 'none', seed: 1 }).snapshot;

    expect(s.tick).toBe(0);
    expect(s.end).toBe('');
    expect(s.workers).toHaveLength(8);
    expect(s.queueDepth).toBe(0);
    expect(s.queueCapacity).toBe(QUEUE);
    expect(s.postings).toEqual([]);
    expect(s.breaker).toBe('closed');
    expect(s.outboxDepth).toBe(0);
  });

  it('REQ-ACC-003 step() advances one tick, and does nothing once the run has ended', () => {
    const sim = new SettlementSim({ mode: 'ordered', fault: 'none', seed: 5 });
    sim.step();
    expect(sim.snapshot.tick).toBe(1);

    const t = play('ordered', 'none', SEEDS[0]);
    const tick = t.sim.snapshot.tick;
    const count = t.sim.events.length;
    t.sim.step();

    expect(t.sim.snapshot.tick).toBe(tick);
    expect(t.sim.events.length).toBe(count);
  });

  it('REQ-PROJ-103 ordered and CAS are not flagged unsafe; unordered and unsynchronised are (browser-only, not in the repository, M8)', () => {
    const flag = (mode: Mode) =>
      new SettlementSim({ mode, fault: 'none', seed: 1 }).snapshot.unsafe;

    expect(flag('ordered')).toBe(false);
    expect(flag('cas')).toBe(false);
    expect(flag('unordered')).toBe(true);
    expect(flag('unsynchronised')).toBe(true);
  });

  it('REQ-ACC-003 the model source uses no Date, Math.random, timers or animation frames, and draws from createRng', () => {
    const raw = readFileSync(`${process.cwd()}/src/app/shared/sim/settlement.model.ts`, 'utf8');
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/\s\/\/.*$/gm, '');

    expect(code).not.toMatch(/\bDate\b/);
    expect(code).not.toMatch(/Math\s*\.\s*random/);
    expect(code).not.toMatch(
      /\b(setTimeout|setInterval|setImmediate|requestAnimationFrame|queueMicrotask)\b/,
    );
    expect(code).not.toMatch(/performance\s*\.\s*now/);
    expect(code).not.toMatch(/\b(document|window)\b/);
    expect(code).toMatch(/from\s+['"]\.\/rng['"]/);
  });
});
