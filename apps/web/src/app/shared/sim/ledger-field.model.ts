import { createRng } from './rng';

/**
 * The model behind the Home invariant field (REQ-HOME-103): a simplified double-entry ledger spread over three
 * nodes and two sides of a network. Pure TypeScript: no DOM, no timers, no pointer input. The view calls
 * `step()` on its own clock and only draws the snapshot.
 *
 * - A transaction (pair) has one debit entry and one credit entry of the same amount. Both entries always have
 *   the same state and move together.
 * - A committed entry is never undone or changed. A failure only makes entries unreachable (cannot be read),
 *   or, after a node is down, "recovering" while that node replays its durable log (assumed to survive).
 * - Every counter is derived from the entries, never from a constant.
 * - Pairs are numbered in layout order, so a pair's node (thirds) and side (halves) follow its position.
 *
 * Simplified: it does not model quorum, consensus or write conflicts (accuracy-baseline trap 10).
 */
export type FailMode = 'node' | 'partition' | 'duplicate';
export type Phase = 'rest' | 'down' | 'replaying' | 'partitioned' | 'redelivering';
export type EntryState = 'reachable' | 'unreachable' | 'recovering';
export type FieldEvent =
  | 'node-down'
  | 'replay-started'
  | 'replayed'
  | 'partitioned'
  | 'link-restored'
  | 'redelivered'
  | 'duplicates-ignored'
  | 'rest';

export interface LedgerPair {
  id: number;
  node: 0 | 1 | 2;
  side: 'near' | 'far';
  state: EntryState;
  amount: number;
}

export interface LedgerEntry {
  pairId: number;
  kind: 'debit' | 'credit';
  amount: number;
  state: EntryState;
}

export interface LedgerCounters {
  committed: number;
  reachable: number;
  unreachable: number;
  recovering: number;
  duplicatesNotApplied: number;
  netAll: number;
  netReachable: number;
}

export interface LedgerSnapshot {
  phase: Phase;
  tick: number;
  pairs: LedgerPair[];
  /** Two per pair: the debit, then the credit. */
  entries: LedgerEntry[];
  /** Ids of the transactions in the batch being delivered again: the whole batch, or empty. */
  redelivered: number[];
  counters: LedgerCounters;
}

/** Ticks each stage lasts. A failure ends by itself: 21 ticks at most (3.2 s at 150 ms a tick). */
const NODE_DOWN_TICKS = 6;
const REPLAY_TICKS = 12;
const PARTITION_TICKS = 12;
const IN_FLIGHT_TICKS = 6;
const AFTER_ARRIVAL_TICKS = 6;

export class LedgerField {
  private readonly nodes: Uint8Array;
  private readonly far: Uint8Array;
  private readonly amounts: Int32Array;
  private readonly states: EntryState[];
  private readonly log: FieldEvent[] = [];
  private phase: Phase = 'rest';
  private mode: FailMode | null = null;
  private tickCount = 0;
  private stage = 0;
  private duplicates = 0;
  private nextNode: number;
  private hit: number[] = [];
  private restored = 0;
  private batch: number[] = [];

  constructor(
    private readonly pairCount: number,
    seed = 1,
  ) {
    const rng = createRng(seed);
    this.nodes = new Uint8Array(pairCount);
    this.far = new Uint8Array(pairCount);
    this.amounts = new Int32Array(pairCount);
    this.states = Array.from({ length: pairCount }, () => 'reachable' as EntryState);
    for (let i = 0; i < pairCount; i++) {
      this.nodes[i] = Math.floor((3 * i) / pairCount);
      this.far[i] = i >= pairCount / 2 ? 1 : 0;
      this.amounts[i] = 1 + Math.floor(rng() * 9_999);
    }
    this.nextNode = 0;
  }

  get atRest(): boolean {
    return this.phase === 'rest';
  }

  get events(): readonly FieldEvent[] {
    return [...this.log];
  }

  /** Starts a failure. Returns false, changing nothing, while another one is running. */
  fail(mode: FailMode): boolean {
    if (this.phase !== 'rest') return false;
    this.mode = mode;
    this.stage = 0;
    if (mode === 'node') {
      const node = this.nextNode;
      this.nextNode = (this.nextNode + 1) % 3;
      this.hit = this.ids().filter((i) => this.nodes[i] === node);
      this.restored = 0;
      for (const i of this.hit) this.states[i] = 'unreachable';
      this.phase = 'down';
      this.log.push('node-down');
    } else if (mode === 'partition') {
      for (const i of this.ids()) if (this.far[i]) this.states[i] = 'unreachable';
      this.phase = 'partitioned';
      this.log.push('partitioned');
    } else {
      this.batch = this.ids().map((i) => i + 1);
      this.phase = 'redelivering';
      this.log.push('redelivered');
    }
    return true;
  }

  /** Advances one tick. At rest it changes nothing. */
  step(): void {
    if (this.phase === 'rest') return;
    this.tickCount++;
    this.stage++;
    if (this.mode === 'node') this.stepNode();
    else if (this.mode === 'partition') this.stepPartition();
    else this.stepDuplicate();
  }

  get snapshot(): LedgerSnapshot {
    const pairs: LedgerPair[] = [];
    const entries: LedgerEntry[] = [];
    const count = { reachable: 0, unreachable: 0, recovering: 0 };
    let netAll = 0;
    let netReachable = 0;
    for (let i = 0; i < this.pairCount; i++) {
      const state = this.states[i];
      const amount = this.amounts[i];
      pairs.push({
        id: i + 1,
        node: this.nodes[i] as 0 | 1 | 2,
        side: this.far[i] ? 'far' : 'near',
        state,
        amount,
      });
      entries.push({ pairId: i + 1, kind: 'debit', amount, state });
      entries.push({ pairId: i + 1, kind: 'credit', amount, state });
    }
    // Derived from the entries: a debit counts +amount, a credit -amount.
    for (const e of entries) {
      count[e.state]++;
      const signed = e.kind === 'debit' ? e.amount : -e.amount;
      netAll += signed;
      if (e.state === 'reachable') netReachable += signed;
    }
    return {
      phase: this.phase,
      tick: this.tickCount,
      pairs,
      entries,
      redelivered: [...this.batch],
      counters: {
        committed: entries.length,
        ...count,
        duplicatesNotApplied: this.duplicates,
        netAll,
        netReachable,
      },
    };
  }

  private ids(): number[] {
    return Array.from({ length: this.pairCount }, (_, i) => i);
  }

  private stepNode(): void {
    if (this.phase === 'down') {
      if (this.stage <= NODE_DOWN_TICKS) return;
      // The node is back: its log is replayed in transaction order.
      for (const i of this.hit) this.states[i] = 'recovering';
      this.phase = 'replaying';
      this.log.push('replay-started');
      return;
    }
    const perTick = Math.max(1, Math.ceil(this.hit.length / REPLAY_TICKS));
    if (this.restored < this.hit.length) {
      const end = Math.min(this.hit.length, this.restored + perTick);
      for (; this.restored < end; this.restored++)
        this.states[this.hit[this.restored]] = 'reachable';
      if (this.restored === this.hit.length) this.log.push('replayed');
      return;
    }
    this.finish();
  }

  private stepPartition(): void {
    if (this.stage <= PARTITION_TICKS) return;
    for (const i of this.ids()) this.states[i] = 'reachable';
    this.log.push('link-restored');
    this.finish();
  }

  private stepDuplicate(): void {
    if (this.stage === IN_FLIGHT_TICKS) {
      // Every id is already recorded: nothing is applied a second time.
      this.duplicates += this.pairCount;
      this.log.push('duplicates-ignored');
    } else if (this.stage > IN_FLIGHT_TICKS + AFTER_ARRIVAL_TICKS) {
      this.finish();
    }
  }

  private finish(): void {
    this.phase = 'rest';
    this.mode = null;
    this.hit = [];
    this.batch = [];
    this.log.push('rest');
  }
}
