import { createRng } from './rng';

/**
 * A simplified model of settlement-lab at e3c1b91 (REQ-PROJ-103): 600 transfers, a bounded queue, 8 workers, a ledger,
 * then a direct publish to a simulated general ledger with retry inside a circuit breaker, and an outbox for failures.
 * Pure and seeded: no DOM, no timers, no clock. One step() is one tick. Sizes and waits are scaled down (40 accounts
 * instead of the runner's, a queue of 64 instead of 1,024, waits in ticks); retry and breaker limits are the repository's
 * (ResilienceConfig.defaults): 3 attempts, a sliding sample of 20, minimum 10 calls, 50 %, 3 half-open probes (class Breaker).
 * Ordered and CAS are the repository's ledgers. 'unordered' and 'unsynchronised' exist only in this browser model.
 */
export type LabMode = 'ordered' | 'cas' | 'unordered' | 'unsynchronised';
export type LabFault = 'none' | 'flaky' | 'outage';
export type InvariantName =
  | 'TOTAL_CONSERVED'
  | 'NO_NEGATIVE_BALANCE'
  | 'POSTED_AT_MOST_ONCE'
  | 'POSTINGS_EXPLAIN_BALANCES'
  | 'POSTINGS_MATCH_ACCEPTED'
  | 'GL_MATCHES_POSTINGS';
export type BreakerState = 'closed' | 'open' | 'half-open';
export type EndState = '' | 'done' | 'deadlock' | 'timeout';
export type GlResult = 'RECORDED' | 'ALREADY_RECORDED' | 'ERROR' | 'ACK_LOST' | 'OUTAGE';

export interface Posting {
  readonly sequence: number;
  readonly transferId: string;
  readonly from: number;
  readonly to: number;
  readonly amount: number;
}
export interface RunRecord {
  readonly openingTotal: number;
  readonly openingBalances: readonly number[];
  readonly balances: readonly number[];
  readonly postings: readonly Posting[];
  readonly acceptedIds: readonly string[];
  readonly generalLedger: Readonly<Record<string, Posting>>;
  readonly end?: EndState;
}
export interface LabEvent {
  tick: number;
  code: string;
  transferId?: string;
  source?: 'direct' | 'relay';
  attempt?: number;
  result?: GlResult;
  outcome?: 'POSTED' | 'REJECTED_FUNDS';
}
export interface LabSnapshot {
  tick: number;
  end: EndState;
  unsafe: boolean;
  queueDepth: number;
  queueCapacity: number;
  outboxDepth: number;
  version: number;
  openingBalances: number[];
  balances: number[];
  locks: (number | null)[];
  workers: { state: string; accounts: number[] }[];
  postings: Posting[];
  generalLedger: Record<string, Posting>;
  breaker: BreakerState;
  opens: number;
  retries: number;
  rejected: number;
  duplicatesAnswered: number;
  lockWaits: number;
  casConflicts: number;
  cycle: number[];
}

interface BreakerConfig {
  windowSize: number;
  minCalls: number;
  failurePercent: number;
  probes: number;
}

/**
 * Resilience4j's count-based circuit breaker (settlement-lab ResilienceConfig.defaults): sliding sample of the last 20
 * calls, at least 10 calls, opens at 50 % failures; half-open lets 3 probes through and decides on the 3rd.
 * Pure: no clock. The model decides when to call halfOpen().
 */
export class Breaker {
  private readonly config: BreakerConfig;
  private current: BreakerState = 'closed';
  private recent: boolean[] = [];
  private probed: boolean[] = [];

  constructor(config: Partial<BreakerConfig> = {}) {
    this.config = { windowSize: 20, minCalls: 10, failurePercent: 50, probes: 3, ...config };
  }

  get state(): BreakerState {
    return this.current;
  }

  permits(): boolean {
    return this.current !== 'open';
  }

  /** One outcome per publish. Returns the new state on a transition. Ignored while open. */
  record(ok: boolean): BreakerState | null {
    const failed = (calls: boolean[]) => calls.filter((c) => !c).length;
    const { windowSize, minCalls, failurePercent, probes } = this.config;
    let to: BreakerState | null = null;
    if (this.current === 'closed') {
      this.recent.push(ok);
      if (this.recent.length > windowSize) this.recent.shift();
      if (
        this.recent.length >= minCalls &&
        failed(this.recent) * 100 >= failurePercent * this.recent.length
      )
        to = 'open';
    } else if (this.current === 'half-open') {
      this.probed.push(ok);
      if (this.probed.length === probes)
        to = failed(this.probed) * 100 >= failurePercent * probes ? 'open' : 'closed';
    }
    if (to === null) return null;
    this.recent = [];
    this.probed = [];
    this.current = to;
    return to;
  }

  halfOpen(): boolean {
    if (this.current !== 'open') return false;
    this.current = 'half-open';
    this.recent = [];
    this.probed = [];
    return true;
  }
}

const sum = (a: readonly number[]): number => a.reduce((x, y) => x + y, 0);

/** The six checks of InvariantChecker. Pure. A run that never finished is not evaluated. */
export function checkInvariants(run: RunRecord): Record<InvariantName, boolean> | 'not-evaluated' {
  if (run.end === 'deadlock' || run.end === 'timeout') return 'not-evaluated';
  const { postings, balances, openingBalances } = run;
  const seen = new Set<string>();
  let once = true;
  for (const p of [...postings].sort((a, b) => a.sequence - b.sequence)) {
    if (seen.has(p.transferId)) once = false;
    seen.add(p.transferId);
  }
  const replay = [...openingBalances];
  for (const p of postings) {
    replay[p.from] -= p.amount;
    replay[p.to] += p.amount;
  }
  const accepted = new Set(run.acceptedIds);
  const ledger = new Map<string, Posting>();
  for (const p of postings) ledger.set(p.transferId, p);
  const gl = new Map(Object.entries(run.generalLedger));
  const same = (a: Posting, b: Posting) =>
    a.sequence === b.sequence &&
    a.transferId === b.transferId &&
    a.from === b.from &&
    a.to === b.to &&
    a.amount === b.amount;
  return {
    TOTAL_CONSERVED: sum(openingBalances) === sum(balances),
    NO_NEGATIVE_BALANCE: balances.every((b) => b >= 0),
    POSTED_AT_MOST_ONCE: once,
    POSTINGS_EXPLAIN_BALANCES:
      replay.length === balances.length && replay.every((v, i) => v === balances[i]),
    POSTINGS_MATCH_ACCEPTED:
      ledger.size === accepted.size && [...ledger.keys()].every((id) => accepted.has(id)),
    GL_MATCHES_POSTINGS:
      gl.size === ledger.size &&
      [...ledger].every(([id, p]) => gl.has(id) && same(gl.get(id) as Posting, p)),
  };
}

// Scaled workload (settlement-lab Workload: hot accounts, duplicate resends) and engine sizes.
const ACCOUNTS = 40;
const HOT = 12;
const HOT_PERCENT = 45;
const DUPLICATE_PERCENT = 5;
const TRANSFERS = 600;
const OPENING = 250; // low on purpose: every seed rejects some transfers for funds
const MAX_AMOUNT = 100;
const QUEUE = 64;
const WORKERS = 8;
const SUBMIT_PER_TICK = 4;
const MAX_TICKS = 20_000;
// ResilienceConfig.defaults, OutboxPublisher (16 senders, one relay), FaultProfile (FLAKY 10 % + 5 %).
const ATTEMPTS = 3;
const SENDERS = 16;
const ERROR_PERCENT = 10;
const LOST_ACK_PERCENT = 5;
// Scaled waits, in ticks.
const OPEN_WAIT = 90;
const RELAY_BACKOFF = 2;
const OUTAGE = { from: 40, to: 110 };

type WorkerState = 'idle' | 'lock-1' | 'lock-2' | 'read' | 'work';
interface Transfer {
  readonly id: string;
  readonly from: number;
  readonly to: number;
  readonly amount: number;
}
interface Worker {
  state: WorkerState;
  job: Transfer | null;
  first: number;
  second: number;
  left: number;
  version: number;
  readFrom: number;
  readTo: number;
}

export class SettlementSim {
  private readonly mode: LabMode;
  private readonly fault: LabFault;
  private readonly rngWork: () => number;
  private readonly rngGl: () => number;
  private readonly transfers: Transfer[] = [];
  private readonly submissions: number[] = [];
  private next = 0;
  private readonly claimed = new Set<number>();
  private readonly outcomes = new Map<number, 'POSTED' | 'REJECTED_FUNDS'>();
  private readonly waiting = new Map<number, number>(); // duplicates whose original has no outcome yet
  private queue: Transfer[] = [];
  private readonly workers: Worker[] = Array.from({ length: WORKERS }, () => ({
    state: 'idle',
    job: null,
    first: 0,
    second: 0,
    left: 0,
    version: 0,
    readFrom: 0,
    readTo: 0,
  }));
  private readonly locks: (number | null)[] = Array.from({ length: ACCOUNTS }, () => null);
  private readonly opening = Array.from({ length: ACCOUNTS }, () => OPENING);
  private readonly balances = [...this.opening];
  private readonly postings: Posting[] = [];
  private readonly accepted: string[] = [];
  private readonly gl: Record<string, Posting> = {};
  private sendQueue: Posting[] = [];
  private outbox: Posting[] = [];
  private relayWait = 0;
  private readonly breaker = new Breaker();
  private readonly outage: { from: number; to: number };
  private openedAt = 0;
  private opens = 0;
  private retries = 0;
  private rejected = 0;
  private duplicates = 0;
  private lockWaits = 0;
  private casConflicts = 0;
  private cycle: number[] = [];
  private tick = 0;
  private end: EndState = '';
  private readonly log: LabEvent[] = [];

  constructor(options: {
    mode: LabMode;
    fault: LabFault;
    seed: number;
    outage?: { from: number; to: number };
  }) {
    this.outage = options.outage ?? OUTAGE;
    this.mode = options.mode;
    this.fault = options.fault;
    const seed = options.seed >>> 0;
    const rng = createRng(seed);
    this.rngWork = createRng(Math.imul(seed, 0x9e3779b1) >>> 0);
    this.rngGl = createRng(Math.imul(seed, 0x85ebca6b) >>> 0);
    const pick = (range: number) => Math.floor(rng() * range);
    for (let i = 0; i < TRANSFERS; i++) {
      const range = rng() * 100 < HOT_PERCENT ? HOT : ACCOUNTS;
      const from = pick(range);
      let to = pick(range);
      if (to === from) to = (from + 1) % range;
      this.transfers.push({ id: `t-${i}`, from, to, amount: 1 + pick(MAX_AMOUNT) });
      this.submissions.push(i);
      if (i > 0 && rng() * 100 < DUPLICATE_PERCENT) this.submissions.push(pick(i)); // a resend of an earlier id
    }
  }

  get events(): readonly LabEvent[] {
    return this.log;
  }

  get snapshot(): LabSnapshot {
    return {
      tick: this.tick,
      end: this.end,
      unsafe: this.mode === 'unordered' || this.mode === 'unsynchronised',
      queueDepth: this.queue.length,
      queueCapacity: QUEUE,
      outboxDepth: this.outbox.length,
      version: this.postings.length,
      openingBalances: [...this.opening],
      balances: [...this.balances],
      locks: [...this.locks],
      workers: this.workers.map((w) => ({
        state: w.state,
        accounts: w.job ? [w.job.from, w.job.to] : [],
      })),
      postings: [...this.postings],
      generalLedger: { ...this.gl },
      breaker: this.breaker.state,
      opens: this.opens,
      retries: this.retries,
      rejected: this.rejected,
      duplicatesAnswered: this.duplicates,
      lockWaits: this.lockWaits,
      casConflicts: this.casConflicts,
      cycle: [...this.cycle],
    };
  }

  get runRecord(): RunRecord {
    return {
      openingTotal: sum(this.opening),
      openingBalances: [...this.opening],
      balances: [...this.balances],
      postings: [...this.postings],
      acceptedIds: [...this.accepted],
      generalLedger: { ...this.gl },
      end: this.end,
    };
  }

  step(): void {
    if (this.end) return;
    this.tick++;
    this.submit();
    for (let n = 0; n < WORKERS; n++) {
      const i = (n + this.tick) % WORKERS;
      this.work(this.workers[i], i);
    }
    this.publishDirect();
    this.relay();
    if (
      this.breaker.state === 'open' &&
      this.tick - this.openedAt >= OPEN_WAIT &&
      this.breaker.halfOpen()
    )
      this.emit('BREAKER_HALF_OPEN');
    if (this.mode === 'unordered' && this.findCycle()) {
      this.end = 'deadlock';
      this.emit('DEADLOCK_DETECTED');
    } else if (this.finished()) {
      this.end = 'done';
      if (this.mode === 'unordered') this.emit('NO_DEADLOCK_THIS_TIME');
    } else if (this.tick >= MAX_TICKS) {
      this.end = 'timeout';
    }
  }

  private emit(code: string, extra: Partial<LabEvent> = {}): void {
    this.log.push({ tick: this.tick, code, ...extra });
  }

  private finished(): boolean {
    return (
      this.next >= this.submissions.length &&
      this.queue.length === 0 &&
      this.workers.every((w) => w.job === null) &&
      this.sendQueue.length === 0 &&
      this.outbox.length === 0 &&
      this.waiting.size === 0
    );
  }

  /** The id is claimed before the queue (IdempotencyStore): a duplicate is never queued, it gets the original's outcome. */
  private submit(): void {
    for (
      let budget = SUBMIT_PER_TICK;
      budget > 0 && this.next < this.submissions.length;
      budget--
    ) {
      const index = this.submissions[this.next];
      if (this.claimed.has(index)) {
        const known = this.outcomes.get(index);
        if (known) this.answerDuplicate(index, known);
        else this.waiting.set(index, (this.waiting.get(index) ?? 0) + 1);
      } else {
        if (this.queue.length >= QUEUE) return; // the client waits for room (here the client waits for room; the engine would wait 100 ms, answer QUEUE_FULL and free the id)
        this.claimed.add(index);
        this.queue.push(this.transfers[index]);
        this.emit('QUEUED', { transferId: this.transfers[index].id });
      }
      this.next++;
    }
  }

  private answerDuplicate(index: number, outcome: 'POSTED' | 'REJECTED_FUNDS'): void {
    this.duplicates++;
    this.emit('DUPLICATE_ANSWERED', { transferId: this.transfers[index].id, outcome });
  }

  private settle(job: Transfer, outcome: 'POSTED' | 'REJECTED_FUNDS'): void {
    const index = Number(job.id.slice(2));
    this.outcomes.set(index, outcome);
    if (outcome === 'REJECTED_FUNDS') this.rejected++;
    else {
      const posting: Posting = Object.freeze({
        sequence: this.postings.length + 1,
        transferId: job.id,
        from: job.from,
        to: job.to,
        amount: job.amount,
      });
      this.postings.push(posting);
      this.accepted.push(job.id);
      this.sendQueue.push(posting);
    }
    this.emit(outcome, { transferId: job.id });
    for (let n = this.waiting.get(index) ?? 0; n > 0; n--) this.answerDuplicate(index, outcome);
    this.waiting.delete(index);
  }

  private move(job: Transfer, from: number, to: number): void {
    this.balances[job.from] = from - job.amount;
    this.balances[job.to] = to + job.amount;
  }

  private finish(w: Worker): void {
    w.job = null;
    w.state = 'idle';
  }

  private work(w: Worker, index: number): void {
    const locking = this.mode === 'ordered' || this.mode === 'unordered';
    if (w.state === 'idle') {
      const job = this.queue.shift();
      if (!job) return;
      w.job = job;
      w.first = this.mode === 'ordered' ? Math.min(job.from, job.to) : job.from; // ordered: lowest account id first
      w.second = this.mode === 'ordered' ? Math.max(job.from, job.to) : job.to;
      w.state = locking ? 'lock-1' : 'read';
      return;
    }
    const job = w.job as Transfer;
    if (w.state === 'lock-1' || w.state === 'lock-2') {
      const account = w.state === 'lock-1' ? w.first : w.second;
      if (this.locks[account] !== null) {
        this.lockWaits++; // a worker-tick spent waiting for a lock
        return;
      }
      this.locks[account] = index;
      w.state = w.state === 'lock-1' ? 'lock-2' : 'work';
      if (w.state === 'work') w.left = 1 + Math.floor(this.rngWork() * 3);
      return;
    }
    if (w.state === 'read') {
      w.version = this.postings.length;
      w.readFrom = this.balances[job.from];
      w.readTo = this.balances[job.to];
      if (this.mode === 'cas' && w.readFrom < job.amount) {
        this.settle(job, 'REJECTED_FUNDS'); // CasLedger answers REJECTED_FUNDS without a swap
        this.finish(w);
        return;
      }
      w.state = 'work';
      w.left = 1 + Math.floor(this.rngWork() * 3);
      return;
    }
    if (--w.left > 0) return;
    if (this.mode === 'cas' && w.version !== this.postings.length) {
      this.casConflicts++; // the compare-and-set failed: read again
      w.state = 'read';
      return;
    }
    if (locking) {
      if (this.balances[job.from] < job.amount) this.settle(job, 'REJECTED_FUNDS');
      else {
        this.move(job, this.balances[job.from], this.balances[job.to]);
        this.settle(job, 'POSTED');
      }
      this.locks[w.first] = null;
      this.locks[w.second] = null;
    } else if (w.readFrom < job.amount) {
      this.settle(job, 'REJECTED_FUNDS'); // unsynchronised decides on what it read, however stale
    } else {
      // CAS: the version is unchanged, so what was read is current. Unsynchronised: stale values overwrite (lost update).
      this.move(job, w.readFrom, w.readTo);
      this.settle(job, 'POSTED');
    }
    this.finish(w);
  }

  /** Workers that hold their first lock and wait for one held by the next worker in the ring. */
  private findCycle(): boolean {
    const waitsFor = this.workers.map((w, i) => {
      const holder = w.state === 'lock-2' ? this.locks[w.second] : null;
      return holder === null || holder === i ? -1 : holder;
    });
    for (let start = 0; start < WORKERS; start++) {
      const path = [start];
      let at = waitsFor[start];
      while (at >= 0 && !path.includes(at)) {
        path.push(at);
        at = waitsFor[at];
      }
      if (at === start) {
        this.cycle = path;
        return true;
      }
    }
    return false;
  }

  // General ledger: FakeGeneralLedger keyed by transfer id, with FaultProfile.
  private callGl(p: Posting): GlResult {
    if (this.fault === 'outage' && this.tick >= this.outage.from && this.tick < this.outage.to)
      return 'OUTAGE';
    const roll = this.fault === 'flaky' ? Math.floor(this.rngGl() * 100) : 100;
    if (roll < ERROR_PERCENT) return 'ERROR';
    const had = p.transferId in this.gl;
    if (!had) this.gl[p.transferId] = p;
    if (roll < ERROR_PERCENT + LOST_ACK_PERCENT) return 'ACK_LOST'; // recorded, but the caller sees a timeout
    return had ? 'ALREADY_RECORDED' : 'RECORDED';
  }

  /** Retry sits inside the breaker: the breaker records one outcome per publish, after the retries. */
  private publish(p: Posting, source: 'direct' | 'relay'): boolean {
    const transferId = p.transferId;
    if (!this.breaker.permits()) {
      this.emit('GL_NOT_PERMITTED', { transferId, source }); // no call, not recorded by the breaker
      return false;
    }
    let ok = false;
    for (let attempt = 1; attempt <= ATTEMPTS && !ok; attempt++) {
      if (attempt > 1) this.retries++;
      const result = this.callGl(p);
      this.emit('GL_ATTEMPT', { transferId, source, attempt, result });
      ok = result === 'RECORDED' || result === 'ALREADY_RECORDED';
    }
    this.emit(ok ? 'PUBLISH_OK' : 'PUBLISH_FAILED', { transferId, source });
    this.record(ok);
    return ok;
  }

  private record(ok: boolean): void {
    const to = this.breaker.record(ok);
    if (to === null) return;
    if (to === 'open') {
      this.openedAt = this.tick;
      this.opens++;
    }
    this.emit(to === 'open' ? 'BREAKER_OPEN' : 'BREAKER_CLOSED');
  }

  /** Every posting is published directly first, up to 16 senders a tick, also while older ones wait. */
  private publishDirect(): void {
    for (let n = 0; n < SENDERS && this.sendQueue.length > 0; n++) {
      const p = this.sendQueue.shift() as Posting;
      if (!this.publish(p, 'direct')) {
        this.outbox.push(p);
        this.emit('OUTBOX_ENQUEUED', { transferId: p.transferId });
      }
    }
  }

  /** One relay retries the head of the outbox, in order, at most once a tick. */
  private relay(): void {
    if (this.relayWait > 0) {
      this.relayWait--;
      return;
    }
    const head = this.outbox[0];
    if (!head || !this.breaker.permits()) return;
    if (this.publish(head, 'relay')) {
      this.outbox.shift();
      this.emit('OUTBOX_DELIVERED', { transferId: head.transferId });
    } else {
      this.relayWait = RELAY_BACKOFF;
    }
  }
}
