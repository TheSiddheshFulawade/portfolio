import { createRng } from './rng';

/**
 * A simplified model of the PayFlow saga in payflow `SPEC.md` section 4, read at commit 8566bf4 (PF-06).
 * Pure and deterministic: no clock, timers or DOM. Time is model time in ms, advanced by the model itself.
 * Each `step()` is exactly one of: a commit, one delivery, one relay ack, one fault toggle or one sweeper re-send.
 * An inbox row, the effect and the outgoing message of a delivery commit in the same step.
 *
 * Simplifications: the sweeper runs only when nothing else can (so it never races a reply), a command still unsent in
 * the outbox is waited for (as the real sweeper postpones it), and compensation by timeout is not modelled: no
 * scenario reaches it, so the sweeper stops at MAX_RESENDS instead of releasing.
 */

export type Scenario =
  | 'completes'
  | 'wallet-crash'
  | 'duplicate-delivery'
  | 'risk-rejection'
  | 'broker-outage'
  | 'insufficient-funds';
export type Service = 'payment' | 'wallet' | 'risk';
export type PaymentStateName =
  | 'NONE'
  | 'RESERVING'
  | 'RISK_CHECKING'
  | 'CAPTURING'
  | 'RELEASING'
  | 'COMPLETED'
  | 'REVERSED'
  | 'REJECTED';
export type MessageType =
  | 'ReserveFunds'
  | 'CheckRisk'
  | 'CaptureFunds'
  | 'ReleaseFunds'
  | 'FundsReserved'
  | 'FundsRejected'
  | 'RiskApproved'
  | 'RiskRejected'
  | 'FundsCaptured'
  | 'FundsReleased';
export type EventCode =
  | 'PAYMENT_COMMITTED'
  | 'HTTP_202'
  | 'RELAY_PUBLISHED'
  | 'MESSAGE_APPLIED'
  | 'REPLY_IGNORED'
  | 'DUPLICATE_DROPPED'
  | 'COMMAND_RESENT'
  | 'BROKER_DOWN'
  | 'BROKER_UP'
  | 'WALLET_DOWN'
  | 'WALLET_UP';
export type HoldState = 'RESERVED' | 'RELEASED' | 'CAPTURED' | 'REJECTED';
export type StepName = 'reserve' | 'risk' | 'capture';

export interface SagaEvent {
  readonly code: EventCode;
  readonly service: Service | 'broker';
  readonly type?: MessageType;
  readonly messageId?: string;
  readonly attempt?: number;
}
export interface OutboxRow {
  readonly service: Service;
  readonly messageId: string;
  readonly type: MessageType;
  readonly attempt: number;
}
export interface Money {
  readonly available: number;
  readonly held: number;
}
export interface SagaSnapshot {
  readonly timeMs: number;
  readonly state: PaymentStateName;
  readonly attempt: number;
  readonly terminal: boolean;
  readonly amount: number;
  readonly inbox: Record<Service, number>;
  readonly outbox: Record<Service, number>;
  readonly outboxRows: readonly OutboxRow[];
  readonly wallets: { readonly payer: Money; readonly payee: Money };
  readonly holds: readonly { readonly state: HoldState }[];
  readonly brokerUp: boolean;
  readonly walletUp: boolean;
}

/** How much of each scenario is merged at the pinned payflow commit. */
export const SCENARIO_LABELS: Record<Scenario, string> = {
  completes: 'merged, tested per service',
  'duplicate-delivery': 'merged, tested per service',
  'insufficient-funds': 'merged, tested per service',
  'broker-outage': 'partly merged',
  'wallet-crash': 'partly merged',
  'risk-rejection': 'partly merged',
};

/** First-attempt step deadlines (SPEC section 4). */
export const STEP_DEADLINE_MS: Record<StepName, number> = {
  reserve: 10_000,
  risk: 5_000,
  capture: 10_000,
};
export const MAX_RESENDS = 3;
const RELEASE_DEADLINE_MS = 10_000;
const DEADLINE_CAP_MS = 30_000;
const TICK_MS = 100;
const OUTAGE_MS = 4_000;
const AMOUNT = 300;

/** min(base x 2^(attempt - 1), cap), as `StepDeadlines.in`. */
export function stepDeadlineMs(step: StepName | 'release', attempt: number): number {
  const base = step === 'release' ? RELEASE_DEADLINE_MS : STEP_DEADLINE_MS[step];
  return Math.min(base * 2 ** (attempt - 1), DEADLINE_CAP_MS);
}

/** The command each waiting state sent, and the step whose deadline it runs under. */
const WAITING: Partial<
  Record<PaymentStateName, { step: StepName | 'release'; command: MessageType }>
> = {
  RESERVING: { step: 'reserve', command: 'ReserveFunds' },
  RISK_CHECKING: { step: 'risk', command: 'CheckRisk' },
  CAPTURING: { step: 'capture', command: 'CaptureFunds' },
  RELEASING: { step: 'release', command: 'ReleaseFunds' },
};

/** SagaStateMachine.on: the states a reply acts in, where it leads and what it sends. */
const ON_REPLY: Partial<
  Record<MessageType, { from: PaymentStateName[]; to: PaymentStateName; send?: MessageType }>
> = {
  FundsReserved: { from: ['RESERVING'], to: 'RISK_CHECKING', send: 'CheckRisk' },
  FundsRejected: { from: ['RESERVING'], to: 'REJECTED' },
  RiskApproved: { from: ['RISK_CHECKING'], to: 'CAPTURING', send: 'CaptureFunds' },
  RiskRejected: { from: ['RISK_CHECKING'], to: 'RELEASING', send: 'ReleaseFunds' },
  FundsCaptured: { from: ['CAPTURING', 'RELEASING'], to: 'COMPLETED' },
  FundsReleased: { from: ['RELEASING'], to: 'REVERSED' },
};

const TERMINAL: PaymentStateName[] = ['COMPLETED', 'REVERSED', 'REJECTED'];
const CONSUMER: Partial<Record<MessageType, Service>> = {
  ReserveFunds: 'wallet',
  CaptureFunds: 'wallet',
  ReleaseFunds: 'wallet',
  CheckRisk: 'risk',
};

interface Delivery {
  readonly to: Service;
  readonly messageId: string;
  readonly type: MessageType;
  readonly attempt: number;
}
interface Balance {
  available: number;
  held: number;
}

export class SagaSim {
  private readonly nextRandom: () => number;
  private readonly usedIds = new Set<string>();
  private readonly log: SagaEvent[] = [];
  private readonly rows: OutboxRow[] = [];
  private readonly topic: Delivery[] = [];
  /** message id to the reply row stored with it (null for the orchestrator, which stores none) */
  private readonly inbox: Record<Service, Map<string, OutboxRow | null>> = {
    payment: new Map(),
    wallet: new Map(),
    risk: new Map(),
  };
  private readonly payer: Balance;
  private readonly payee: Balance;
  private now = 0;
  private state: PaymentStateName = 'NONE';
  private attempt = 0;
  private deadline: number | null = null;
  private hold: HoldState | null = null;
  private brokerUp = true;
  private walletUp = true;
  private faulted = false;
  private resent = false;
  private brokerDownAt = 0;

  constructor(
    private readonly scenario: Scenario,
    seed = 1,
  ) {
    this.nextRandom = createRng(seed);
    const poor = scenario === 'insufficient-funds';
    this.payer = { available: poor ? 120 : 800, held: 0 };
    this.payee = { available: poor ? 880 : 200, held: 0 };
  }

  get events(): readonly SagaEvent[] {
    return this.log;
  }

  /** The payment is terminal, every outbox row is acked and every message is consumed. */
  get done(): boolean {
    return TERMINAL.includes(this.state) && this.rows.length === 0 && this.topic.length === 0;
  }

  get snapshot(): SagaSnapshot {
    const count = (s: Service): number => this.rows.filter((r) => r.service === s).length;
    return {
      timeMs: this.now,
      state: this.state,
      attempt: this.attempt,
      terminal: TERMINAL.includes(this.state),
      amount: AMOUNT,
      inbox: {
        payment: this.inbox.payment.size,
        wallet: this.inbox.wallet.size,
        risk: this.inbox.risk.size,
      },
      outbox: { payment: count('payment'), wallet: count('wallet'), risk: count('risk') },
      outboxRows: this.rows.map((r) => ({ ...r })),
      wallets: { payer: { ...this.payer }, payee: { ...this.payee } },
      holds: this.hold ? [{ state: this.hold }] : [],
      brokerUp: this.brokerUp,
      walletUp: this.walletUp,
    };
  }

  step(): void {
    if (this.done) return;
    this.now += TICK_MS;
    if (this.state === 'NONE') {
      this.commitPayment();
      return;
    }
    // one action per step, in this priority: fault, relay ack, delivery, sweeper
    const acted = this.injectFault() || this.relay() || this.deliver() || this.resend();
    if (!acted) throw new Error('saga model stalled: no action is enabled');
  }

  /** PaymentService.create: RECEIVED, RESERVING and ReserveFunds in one commit; the 202 follows it. */
  private commitPayment(): void {
    this.state = 'RESERVING';
    this.attempt = 1;
    this.deadline = this.now + stepDeadlineMs('reserve', 1);
    this.queue('payment', 'ReserveFunds', 1);
    this.emit('PAYMENT_COMMITTED', 'payment');
    this.emit('HTTP_202', 'payment');
  }

  /** One scripted fault per scenario, and its recovery. */
  private injectFault(): boolean {
    if (this.scenario === 'broker-outage') {
      if (this.brokerUp && !this.faulted && this.rows.length > 0) {
        this.faulted = true;
        this.brokerUp = false;
        this.brokerDownAt = this.now;
        this.emit('BROKER_DOWN', 'broker');
        return true;
      }
      if (!this.brokerUp) {
        this.brokerUp = true;
        this.now = this.brokerDownAt + OUTAGE_MS;
        this.emit('BROKER_UP', 'broker');
        return true;
      }
    }
    if (this.scenario === 'wallet-crash') {
      if (this.walletUp && !this.faulted && this.topic.some((m) => m.to === 'wallet')) {
        this.faulted = true;
        this.walletUp = false;
        this.emit('WALLET_DOWN', 'wallet');
        return true;
      }
      if (!this.walletUp && this.resent && !this.rows.some((r) => r.service === 'payment')) {
        this.walletUp = true;
        this.emit('WALLET_UP', 'wallet');
        return true;
      }
    }
    return false;
  }

  /** OutboxRelay: the broker acks one row, which then leaves the outbox. */
  private relay(): boolean {
    const row = this.brokerUp ? this.rows.shift() : undefined;
    if (!row) return false;
    this.topic.push({
      to: CONSUMER[row.type] ?? 'payment',
      messageId: row.messageId,
      type: row.type,
      attempt: row.attempt,
    });
    this.emit('RELAY_PUBLISHED', row.service, row);
    return true;
  }

  /** The oldest message whose consumer is running. */
  private deliver(): boolean {
    const at = this.topic.findIndex((m) => m.to !== 'wallet' || this.walletUp);
    const m = at < 0 ? undefined : this.topic.splice(at, 1)[0];
    if (!m) return false;
    const seen = this.inbox[m.to];
    if (seen.has(m.messageId)) {
      // IdempotentConsumer: no effect; wallet and risk queue the stored reply again, with the same message id
      const stored = seen.get(m.messageId);
      if (stored) this.rows.push({ ...stored });
      this.emit('DUPLICATE_DROPPED', m.to, m);
    } else if (m.to === 'payment') {
      this.applyReply(m);
    } else {
      const reply = m.to === 'wallet' ? this.walletEffect(m) : this.riskEffect();
      seen.set(m.messageId, this.queue(m.to, reply, m.attempt));
      this.emit('MESSAGE_APPLIED', m.to, m);
      // the offset was not committed after the database commit (crash or rebalance): Kafka redelivers the command
      if (this.scenario === 'duplicate-delivery' && m.type === 'CaptureFunds') this.topic.push(m);
    }
    return true;
  }

  /** SagaStateMachine.on for a first delivery. Payment.movedTo restarts the attempt count at 1. */
  private applyReply(m: Delivery): void {
    const rule = ON_REPLY[m.type];
    const counts =
      rule?.from.includes(this.state) === true &&
      (this.state === 'RELEASING' || m.attempt === this.attempt);
    this.inbox.payment.set(m.messageId, null);
    if (!rule || !counts) {
      this.emit('REPLY_IGNORED', 'payment', m);
      return;
    }
    this.state = rule.to;
    const waits = WAITING[rule.to];
    this.deadline = waits ? this.now + stepDeadlineMs(waits.step, 1) : null;
    if (rule.send) {
      this.attempt = 1;
      this.queue('payment', rule.send, 1);
    }
    this.emit('MESSAGE_APPLIED', 'payment', m);
  }

  /** WalletCommandHandler: the hold row decides once, so a re-sent command moves no money again. */
  private walletEffect(m: Delivery): MessageType {
    switch (m.type) {
      case 'ReserveFunds':
        if (this.hold) {
          return this.hold === 'RESERVED' || this.hold === 'CAPTURED'
            ? 'FundsReserved'
            : 'FundsRejected';
        }
        if (this.payer.available < AMOUNT) {
          this.hold = 'REJECTED';
          return 'FundsRejected';
        }
        this.payer.available -= AMOUNT;
        this.payer.held += AMOUNT;
        this.hold = 'RESERVED';
        return 'FundsReserved';
      case 'CaptureFunds':
        if (this.hold === 'RESERVED') {
          // JdbcWallets.capture: payer held down, payee available up, in this one transaction
          this.payer.held -= AMOUNT;
          this.payee.available += AMOUNT;
          this.hold = 'CAPTURED';
        }
        if (this.hold !== 'CAPTURED') throw new Error('a capture without a hold is not modelled');
        return 'FundsCaptured';
      default:
        // ReleaseFunds: a captured hold answers with the truth; with no hold a release leaves a tombstone
        if (this.hold === 'CAPTURED') return 'FundsCaptured';
        if (this.hold === 'RESERVED') {
          this.payer.held -= AMOUNT;
          this.payer.available += AMOUNT;
        }
        this.hold = this.hold === 'REJECTED' ? 'REJECTED' : 'RELEASED';
        return 'FundsReleased';
    }
  }

  private riskEffect(): MessageType {
    return this.scenario === 'risk-rejection' ? 'RiskRejected' : 'RiskApproved';
  }

  /** PaymentSweeper: same command, new message id, next attempt, in one commit. It waits for the deadline. */
  private resend(): boolean {
    const waits = WAITING[this.state];
    const unsent = this.rows.some((r) => r.service === 'payment');
    if (!waits || unsent || this.deadline === null) return false;
    if (this.state !== 'RELEASING' && this.attempt > MAX_RESENDS) return false;
    this.now = Math.max(this.now, this.deadline);
    this.attempt += 1;
    this.deadline = this.now + stepDeadlineMs(waits.step, this.attempt);
    this.resent = true;
    this.emit('COMMAND_RESENT', 'payment', this.queue('payment', waits.command, this.attempt));
    return true;
  }

  private queue(service: Service, type: MessageType, attempt: number): OutboxRow {
    let messageId: string;
    do {
      messageId = Math.floor(this.nextRandom() * 2 ** 32)
        .toString(16)
        .padStart(8, '0');
    } while (this.usedIds.has(messageId));
    this.usedIds.add(messageId);
    const row: OutboxRow = { service, messageId, type, attempt };
    this.rows.push(row);
    return row;
  }

  private emit(
    code: EventCode,
    service: SagaEvent['service'],
    m?: { type: MessageType; messageId: string; attempt: number },
  ): void {
    this.log.push(
      m
        ? { code, service, type: m.type, messageId: m.messageId, attempt: m.attempt }
        : { code, service },
    );
  }
}
