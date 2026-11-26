import { LedgerField } from './ledger-field.model';

// REQ-HOME-103, REQ-ACC-003: the invariant field is a pure, seeded model; the canvas only draws it.
// Assumed API (types come from the implementation):
//   new LedgerField(pairCount, seed?)  fail(mode): boolean  step(): void  atRest  snapshot  events
//   snapshot = { phase, tick, pairs: { id, node, side, state, amount }[],
//                entries: { pairId, kind: 'debit' | 'credit', amount, state }[] (two per pair, one canvas dot each),
//                redelivered: number[],
//                counters: { committed, reachable, unreachable, recovering, duplicatesNotApplied, netAll, netReachable } }
// Counters count entries (two per pair) except duplicatesNotApplied (transactions). The model has no
// pointer or displacement input at all, so pointer movement cannot change a counter.
type Mode = 'node' | 'partition' | 'duplicate';
type Snap = LedgerField['snapshot'];
type Pair = Snap['pairs'][number];

const MODES: Mode[] = ['node', 'partition', 'duplicate'];
const MAX_TICKS = 1_000; // "bounded": a run that has not come to rest by then is a bug
const SIZES = [6, 12, 50, 1_044];
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

const copy = (s: Snap): Snap => structuredClone(s) as Snap;
const events = (m: LedgerField): string[] => [...m.events] as string[];
const sortedIds = (ids: readonly number[]) => [...ids].sort((a, b) => a - b);

/** Fails the model and steps it to rest, returning a deep copy of every snapshot (the one after fail() first). */
function run(m: LedgerField, mode: Mode): Snap[] {
  const trace: Snap[] = [];
  expect(m.fail(mode)).toBe(true);
  trace.push(copy(m.snapshot));
  let ticks = 0;
  while (!m.atRest) {
    if (++ticks > MAX_TICKS)
      throw new Error(`${mode} did not return to rest in ${MAX_TICKS} ticks`);
    m.step();
    trace.push(copy(m.snapshot));
  }
  return trace;
}

const byId = (snap: Snap) => new Map(snap.pairs.map((p) => [p.id, p]));
const entryCount = (state: Pair['state'], snap: Snap) =>
  snap.entries.filter((e) => e.state === state).length;

/**
 * Independent oracle: every number is recomputed from the entries (what the canvas draws, one dot each),
 * never read from the counters. One transaction = one debit and one credit of the same positive amount.
 */
function checkEveryTick(snap: Snap, base: Snap) {
  const c = snap.counters;
  const net = (es: Snap['entries']) =>
    es.filter((e) => e.kind === 'debit').reduce((a, e) => a + e.amount, 0) -
    es.filter((e) => e.kind === 'credit').reduce((a, e) => a + e.amount, 0);
  const reachable = snap.entries.filter((e) => e.state === 'reachable');

  // Exactly two entries per pair: one debit, one credit, equal amount, equal state (never split).
  expect(snap.entries).toHaveLength(2 * snap.pairs.length);
  for (const p of snap.pairs) {
    const legs = snap.entries.filter((e) => e.pairId === p.id);
    expect(legs.map((e) => e.kind).sort()).toEqual(['credit', 'debit']);
    expect(legs[0].amount).toBe(legs[1].amount);
    expect(legs[0].amount).toBe(p.amount);
    expect(legs[0].state).toBe(legs[1].state);
    expect(legs[0].state).toBe(p.state);
  }

  expect(net(snap.entries)).toBe(0);
  expect(net(reachable)).toBe(0);
  expect(c.netAll).toBe(0);
  expect(c.netReachable).toBe(0);

  expect(c.committed).toBe(2 * base.pairs.length);
  expect(c.committed).toBe(snap.entries.length);
  expect(c.reachable).toBe(entryCount('reachable', snap));
  expect(c.unreachable).toBe(entryCount('unreachable', snap));
  expect(c.recovering).toBe(entryCount('recovering', snap));
  expect(c.committed).toBe(c.reachable + c.unreachable + c.recovering);

  // No committed entry disappears or changes: same ids, nodes, sides and amounts as at the start.
  expect(snap.pairs.map((p) => [p.id, p.node, p.side, p.amount])).toEqual(
    base.pairs.map((p) => [p.id, p.node, p.side, p.amount]),
  );
  // "Recovering" exists only while a node's log is replayed.
  if (c.recovering > 0) expect(snap.phase).toBe('replaying');
  // The redelivered batch is always the whole batch: every pair id exactly once.
  if (snap.redelivered.length > 0) {
    expect(sortedIds(snap.redelivered)).toEqual(sortedIds(base.pairs.map((p) => p.id)));
  }
}

describe('the oracle can fail (REQ-HOME-103)', () => {
  const fresh = (): Snap => copy(new LedgerField(6, 1).snapshot);

  it('REQ-HOME-103 passes on a valid snapshot', () => {
    const s = fresh();
    expect(() => checkEveryTick(s, s)).not.toThrow();
  });

  it('REQ-HOME-103 throws when one leg of a pair is unreachable and its partner is reachable', () => {
    const s = fresh();
    s.entries[0].state = 'unreachable';
    s.counters.reachable -= 1;
    s.counters.unreachable += 1;

    expect(() => checkEveryTick(s, fresh())).toThrow();
  });

  it('REQ-HOME-103 throws when the two legs of a pair have unequal amounts', () => {
    const s = fresh();
    s.entries[0].amount += 1;

    expect(() => checkEveryTick(s, fresh())).toThrow();
  });

  it('REQ-HOME-103 throws when a debit has no credit, even though the counters still say zero', () => {
    const s = fresh();
    s.entries[1].kind = s.entries[0].kind;

    expect(() => checkEveryTick(s, fresh())).toThrow();
  });
});

describe('LedgerField (REQ-HOME-103)', () => {
  describe('construction', () => {
    it('REQ-HOME-103 starts at rest with one committed pair per id, positive integer amounts, all reachable', () => {
      const m = new LedgerField(12, 1);
      const s = m.snapshot;

      expect(m.atRest).toBe(true);
      expect(s.phase).toBe('rest');
      expect(s.pairs).toHaveLength(12);
      expect(new Set(s.pairs.map((p) => p.id)).size).toBe(12);
      for (const p of s.pairs) {
        expect(Number.isInteger(p.amount) && p.amount > 0).toBe(true);
        expect(p.state).toBe('reachable');
        expect([0, 1, 2]).toContain(p.node);
        expect(['near', 'far']).toContain(p.side);
      }
      expect(s.counters).toMatchObject({
        committed: 24,
        reachable: 24,
        unreachable: 0,
        recovering: 0,
        duplicatesNotApplied: 0,
        netAll: 0,
        netReachable: 0,
      });
      expect(s.redelivered).toEqual([]);
      expect(events(m)).toEqual([]);
    });

    it('REQ-HOME-103 all three nodes and both sides hold pairs, so every failure has something to affect', () => {
      for (const size of SIZES) {
        const { pairs } = new LedgerField(size, 3).snapshot;

        expect(new Set(pairs.map((p) => p.node))).toEqual(new Set([0, 1, 2]));
        expect(new Set(pairs.map((p) => p.side))).toEqual(new Set(['near', 'far']));
      }
    });

    it('REQ-ACC-003 the same seed gives the same pairs; another seed gives other amounts', () => {
      expect(new LedgerField(50, 7).snapshot).toEqual(new LedgerField(50, 7).snapshot);
      const a = new LedgerField(50, 7).snapshot.pairs.map((p) => p.amount);
      const b = new LedgerField(50, 8).snapshot.pairs.map((p) => p.amount);
      expect(a).not.toEqual(b);
    });

    it('REQ-HOME-103 step() at rest changes nothing and logs nothing', () => {
      const m = new LedgerField(12, 1);
      const before = copy(m.snapshot);

      m.step();
      m.step();

      expect(m.snapshot.pairs).toEqual(before.pairs);
      expect(m.snapshot.phase).toBe('rest');
      expect(m.atRest).toBe(true);
      expect(events(m)).toEqual([]);
    });
  });

  describe('every mode, every tick (properties over seeds and sizes)', () => {
    for (const mode of MODES) {
      it(`REQ-HOME-103 ${mode}: net is 0 for all and for reachable entries, counters sum to committed, nothing disappears, back to rest`, () => {
        for (const size of SIZES) {
          for (const seed of size > 100 ? [1, 2] : SEEDS) {
            const m = new LedgerField(size, seed);
            const base = copy(m.snapshot);
            const trace = run(m, mode);

            for (const snap of [base, ...trace]) checkEveryTick(snap, base);
            const end = trace[trace.length - 1];
            expect(end.phase).toBe('rest');
            expect(end.counters.reachable).toBe(2 * size);
            expect(end.counters.unreachable + end.counters.recovering).toBe(0);
            expect(end.pairs.every((p) => p.state === 'reachable')).toBe(true);
            expect(end.redelivered).toEqual([]);
          }
        }
      });

      it(`REQ-HOME-103 ${mode}: a pair has one state, so both of its entries always move together`, () => {
        // The snapshot holds one state per pair id; a split pair would show as an odd entry count.
        for (const snap of run(new LedgerField(50, 4), mode)) {
          expect(snap.counters.reachable % 2).toBe(0);
          expect(snap.counters.unreachable % 2).toBe(0);
          expect(snap.counters.recovering % 2).toBe(0);
          expect(new Set(snap.pairs.map((p) => p.id)).size).toBe(snap.pairs.length);
        }
      });

      it(`REQ-HOME-103 ${mode}: tick advances by one per step while a failure runs`, () => {
        const trace = run(new LedgerField(12, 1), mode);

        for (let i = 1; i < trace.length; i++) {
          expect(trace[i].tick - trace[i - 1].tick).toBe(1);
        }
      });
    }
  });

  describe('partition', () => {
    it('REQ-HOME-103 the near side stays reachable throughout; far pairs go unreachable, then reachable, never recovering', () => {
      for (const seed of SEEDS) {
        const trace = run(new LedgerField(50, seed), 'partition');
        const far = trace[0].pairs.filter((p) => p.side === 'far').map((p) => p.id);
        const near = trace[0].pairs.filter((p) => p.side === 'near').map((p) => p.id);
        const farStates: string[] = [];

        for (const snap of trace) {
          const pairs = byId(snap);
          for (const id of near) expect(pairs.get(id)!.state).toBe('reachable');
          for (const id of far) expect(pairs.get(id)!.state).not.toBe('recovering');
          expect(snap.counters.recovering).toBe(0);
          expect(['rest', 'partitioned']).toContain(snap.phase);
          if (snap.phase === 'partitioned') {
            // The whole far side is unreachable together, and only the far side.
            expect(snap.counters.unreachable).toBe(2 * far.length);
            expect(snap.counters.reachable).toBe(2 * near.length);
          }
          farStates.push(pairs.get(far[0])!.state);
        }
        const collapsed = farStates.filter((s, i) => i === 0 || s !== farStates[i - 1]);
        expect(collapsed.join('>')).toMatch(/^(reachable>)?unreachable>reachable$/);
      }
    });

    it('REQ-HOME-103 logs the partition and the restored link, in that order, then rest', () => {
      const m = new LedgerField(12, 1);
      run(m, 'partition');

      expect(events(m)).toEqual(['partitioned', 'link-restored', 'rest']);
    });
  });

  describe('node failure', () => {
    it("REQ-HOME-103 only that node's pairs go unreachable, then recovering, then reachable, replayed in id order", () => {
      for (const seed of SEEDS) {
        const trace = run(new LedgerField(50, seed), 'node');
        const down = trace.find((s) => s.phase === 'down');
        expect(down).toBeDefined();
        const unreachable = down!.pairs.filter((p) => p.state === 'unreachable');
        const nodes = new Set(unreachable.map((p) => p.node));
        expect(nodes.size).toBe(1);
        const node = [...nodes][0];
        const hit = trace[0].pairs.filter((p) => p.node === node).map((p) => p.id);
        const others = trace[0].pairs.filter((p) => p.node !== node).map((p) => p.id);
        expect(sortedIds(unreachable.map((p) => p.id))).toEqual(sortedIds(hit));

        const order = sortedIds(hit);
        const history = new Map<number, string[]>(hit.map((id) => [id, []]));
        for (const snap of trace) {
          const pairs = byId(snap);
          for (const id of others) expect(pairs.get(id)!.state).toBe('reachable');
          if (snap.phase === 'down') expect(snap.counters.recovering).toBe(0);
          // Stricter reading: once replay starts nothing is still merely unreachable.
          if (snap.phase === 'replaying') expect(snap.counters.unreachable).toBe(0);
          // Replay in transaction order: restored pairs always form a prefix of the node's ids.
          if (snap.phase === 'replaying' || snap.phase === 'rest') {
            const restored = order.map((id) => pairs.get(id)!.state === 'reachable');
            const firstPending = restored.indexOf(false);
            if (firstPending >= 0) expect(restored.slice(firstPending).some(Boolean)).toBe(false);
          }
          for (const id of hit) {
            const h = history.get(id)!;
            const s = pairs.get(id)!.state;
            if (h[h.length - 1] !== s) h.push(s);
          }
        }
        for (const id of hit) {
          expect(history.get(id)!.join('>')).toMatch(
            /^(reachable>)?unreachable>recovering>reachable$/,
          );
        }
        expect(trace.some((s) => s.phase === 'replaying' && s.counters.recovering > 0)).toBe(true);
        expect(trace.map((s) => s.phase)).toEqual(
          expect.arrayContaining(['down', 'replaying', 'rest']),
        );
      }
    });

    it('REQ-HOME-103 replay restores the pairs of the failed node in transaction id order, never a later id first', () => {
      for (const seed of [11, 12, 13]) {
        const m = new LedgerField(50, seed);
        for (let round = 0; round < 3; round++) {
          const trace = run(m, 'node');
          const down = trace.find((s) => s.phase === 'down')!;
          const node = down.pairs.find((p) => p.state === 'unreachable')!.node;
          const hit = new Set(down.pairs.filter((p) => p.node === node).map((p) => p.id));
          // The tick at which a pair of the failed node turns reachable again (the transition, not the state).
          const restoredAt = new Map<number, number>();
          for (let tick = 1; tick < trace.length; tick++) {
            const before = byId(trace[tick - 1]);
            for (const p of trace[tick].pairs) {
              if (!hit.has(p.id) || p.state !== 'reachable') continue;
              if (before.get(p.id)!.state !== 'reachable' && !restoredAt.has(p.id)) {
                restoredAt.set(p.id, tick);
              }
            }
          }
          const ids = sortedIds([...restoredAt.keys()]);

          expect(ids).toEqual(sortedIds([...hit]));
          expect(ids.length).toBeGreaterThan(1);
          for (let i = 1; i < ids.length; i++) {
            expect(restoredAt.get(ids[i])!).toBeGreaterThanOrEqual(restoredAt.get(ids[i - 1])!);
          }
        }
      }
    });

    it('REQ-HOME-103 successive node failures rotate over the three nodes', () => {
      const m = new LedgerField(50, 5);
      const failed: number[] = [];
      for (let i = 0; i < 6; i++) {
        const down = run(m, 'node').find((s) => s.phase === 'down')!;
        failed.push(down.pairs.find((p) => p.state === 'unreachable')!.node);
      }

      expect(new Set(failed.slice(0, 3)).size).toBe(3);
      expect(failed.slice(3)).toEqual(failed.slice(0, 3));
    });

    it('REQ-HOME-103 logs the failure, the start of replay and its end, in that order, then rest', () => {
      const m = new LedgerField(12, 1);
      run(m, 'node');

      expect(events(m)).toEqual(['node-down', 'replay-started', 'replayed', 'rest']);
    });
  });

  describe('duplicate delivery', () => {
    it('REQ-HOME-103 the whole batch comes again: every pair id exactly once, no state or balance change', () => {
      for (const seed of SEEDS) {
        const trace = run(new LedgerField(50, seed), 'duplicate');
        const ids = sortedIds(trace[0].pairs.map((p) => p.id));
        const delivery = trace.filter((s) => s.redelivered.length > 0);

        expect(delivery.length).toBeGreaterThan(0);
        for (const snap of delivery) {
          expect(sortedIds(snap.redelivered)).toEqual(ids);
          expect(new Set(snap.redelivered).size).toBe(snap.redelivered.length);
        }
        for (const snap of trace) {
          expect(snap.pairs.every((p) => p.state === 'reachable')).toBe(true);
          expect(snap.pairs.map((p) => p.amount)).toEqual(trace[0].pairs.map((p) => p.amount));
          expect(snap.counters.reachable).toBe(100);
          expect(snap.counters.unreachable + snap.counters.recovering).toBe(0);
          expect(['rest', 'redelivering']).toContain(snap.phase);
        }
      }
    });

    it('REQ-HOME-103 duplicatesNotApplied grows by the number of pairs, only in the step where the batch arrives, and accumulates', () => {
      const size = 50;
      const m = new LedgerField(size, 3);
      let expected = 0;
      for (let round = 1; round <= 3; round++) {
        expect(m.fail('duplicate')).toBe(true);
        const counts = [m.snapshot.counters.duplicatesNotApplied];
        const logLengths = [events(m).length];
        let ticks = 0;
        while (!m.atRest) {
          if (++ticks > MAX_TICKS) throw new Error('no rest');
          m.step();
          counts.push(m.snapshot.counters.duplicatesNotApplied);
          logLengths.push(events(m).length);
        }
        // The counter moves in exactly one step, by the number of pairs, and that step logged the arrival.
        const moves = counts.map((c, i) => c - (i === 0 ? expected : counts[i - 1]));
        const moved = moves.flatMap((d, i) => (d !== 0 ? [i] : []));
        expect(moved).toHaveLength(1);
        expect(moves[moved[0]]).toBe(size);
        expect(events(m)).toContain('duplicates-ignored');
        const newlyLogged = events(m).slice(0, logLengths[moved[0]]);
        expect(newlyLogged[newlyLogged.length - 1]).toBe('duplicates-ignored');
        expected += size;
        expect(m.snapshot.counters.duplicatesNotApplied).toBe(expected);
      }
    });

    it('REQ-HOME-103 other failure modes never move the duplicate counter or the redelivered list', () => {
      const m = new LedgerField(12, 2);
      run(m, 'node');
      run(m, 'partition');

      expect(m.snapshot.counters.duplicatesNotApplied).toBe(0);
      expect(m.snapshot.redelivered).toEqual([]);
    });

    it('REQ-HOME-103 logs redelivery, then duplicates ignored, then rest', () => {
      const m = new LedgerField(12, 1);
      run(m, 'duplicate');

      expect(events(m)).toEqual(['redelivered', 'duplicates-ignored', 'rest']);
    });
  });

  describe('activity and determinism', () => {
    it('REQ-HOME-103 a second fail() while a failure is active is ignored: returns false and changes nothing', () => {
      for (const first of MODES) {
        for (const second of MODES) {
          const control = new LedgerField(12, 6);
          const m = new LedgerField(12, 6);
          expect(control.fail(first)).toBe(true);
          expect(m.fail(first)).toBe(true);
          control.step();
          m.step();

          expect(m.atRest).toBe(false);
          expect(m.fail(second)).toBe(false);

          let ticks = 0;
          while (!control.atRest || !m.atRest) {
            if (++ticks > MAX_TICKS) throw new Error('no rest');
            expect(m.snapshot).toEqual(control.snapshot);
            control.step();
            m.step();
          }
          expect(m.snapshot).toEqual(control.snapshot);
          expect(events(m)).toEqual(events(control));
        }
      }
    });

    it('REQ-HOME-103 fail() leaves rest at once, and the model accepts a new failure after returning to rest', () => {
      const m = new LedgerField(12, 1);
      expect(m.fail('partition')).toBe(true);
      expect(m.atRest).toBe(false);
      while (!m.atRest) m.step();

      expect(m.fail('node')).toBe(true);
      expect(m.atRest).toBe(false);
    });

    it('REQ-HOME-103 returns to rest within a bounded number of ticks, whatever the seed', () => {
      for (const mode of MODES) {
        for (const seed of SEEDS) {
          expect(() => run(new LedgerField(50, seed), mode)).not.toThrow();
        }
      }
    });

    it('REQ-ACC-003 the same seed gives the same trace for a sequence of failures; events accumulate in order', () => {
      const play = (seed: number) => {
        const m = new LedgerField(30, seed);
        const trace = [...MODES, 'node' as Mode].flatMap((mode) => run(m, mode));
        return { trace, log: events(m) };
      };

      expect(play(9)).toEqual(play(9));
      expect(play(9).log).toEqual([
        'node-down',
        'replay-started',
        'replayed',
        'rest',
        'partitioned',
        'link-restored',
        'rest',
        'redelivered',
        'duplicates-ignored',
        'rest',
        'node-down',
        'replay-started',
        'replayed',
        'rest',
      ]);
    });

    it('REQ-ACC-003 a snapshot taken earlier is not changed by later steps (no aliasing)', () => {
      const m = new LedgerField(12, 1);
      m.fail('node');
      const early = m.snapshot;
      const frozen = copy(early);
      while (!m.atRest) m.step();

      expect(early).toEqual(frozen);
    });

    it('REQ-HOME-103 step and fail take no pointer or displacement argument', () => {
      expect(LedgerField.prototype.step.length).toBe(0);
      expect(LedgerField.prototype.fail.length).toBe(1);
    });
  });
});
