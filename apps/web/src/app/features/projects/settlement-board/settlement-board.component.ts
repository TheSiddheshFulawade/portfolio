import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { labContent } from '../../../core/content/lab-content';
import {
  InvariantName,
  LabEvent,
  LabFault,
  LabMode,
  SettlementSim,
  checkInvariants,
} from '../../../shared/sim/settlement.model';

/** Ticks of the model per animation frame, the same for every mode: the longest run is a few seconds (REQ-MOT-101). */
const TICKS_PER_FRAME = 8;
/** Ordinary events kept in the log; breaker transitions, deadlock, start and end are always kept. */
const DETAIL_WINDOW = 12;
const RUN_START = -1;
const RUN_END = Number.MAX_SAFE_INTEGER;

const MODES: readonly LabMode[] = ['ordered', 'cas', 'unordered', 'unsynchronised'];
const FAULTS: readonly LabFault[] = ['none', 'flaky', 'outage'];
const INVARIANTS: readonly InvariantName[] = [
  'TOTAL_CONSERVED',
  'NO_NEGATIVE_BALANCE',
  'POSTED_AT_MOST_ONCE',
  'POSTINGS_EXPLAIN_BALANCES',
  'POSTINGS_MATCH_ACCEPTED',
  'GL_MATCHES_POSTINGS',
];
const KEY_EVENTS = new Set([
  'BREAKER_OPEN',
  'BREAKER_HALF_OPEN',
  'BREAKER_CLOSED',
  'DEADLOCK_DETECTED',
]);
const DETAIL_EVENTS = new Set([
  'POSTED',
  'REJECTED_FUNDS',
  'DUPLICATE_ANSWERED',
  'OUTBOX_ENQUEUED',
  'OUTBOX_DELIVERED',
  'PUBLISH_FAILED',
  'GL_NOT_PERMITTED',
]);

interface LogLine {
  readonly i: number;
  readonly text: string;
}

const fill = (template: string, values: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
const intl = (n: number): string => n.toLocaleString('en-US');
const sum = (a: readonly number[]): number => a.reduce((x, y) => x + y, 0);

/**
 * The Settlement Lab board (REQ-PROJ-103, 105): a simplified model of settlement-lab, run in the browser. The model
 * (`SettlementSim`) owns every number and the six invariant checks; this component only steps it and draws its
 * snapshot as text and shapes. It never starts on load. The loop is requestAnimationFrame at one fixed rate and runs
 * only while a run is playing, the tab is visible and the board is on screen (REQ-MOT-103). With reduced motion Run
 * steps the model to its end at once, so the final text and numbers are the same (REQ-MOT-102).
 */
@Component({
  selector: 'sf-settlement-board',
  templateUrl: './settlement-board.component.html',
  styleUrl: './settlement-board.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettlementBoardComponent {
  readonly seed = input(20_261_100);

  protected readonly copy = labContent.board;
  protected readonly modes = MODES;
  protected readonly faults = FAULTS;

  protected readonly mode = signal<LabMode>('ordered');
  protected readonly fault = signal<LabFault>('none');
  protected readonly playing = signal(false);
  private readonly started = signal(false);

  private sim = this.fresh();
  protected readonly snap = signal(this.sim.snapshot);
  private readonly verdict = signal<ReturnType<typeof checkInvariants> | null>(null);
  protected readonly lines = signal<readonly LogLine[]>([]);

  protected readonly rows = computed(() => {
    const verdict = this.verdict();
    const words = this.copy.invariants;
    return INVARIANTS.map((name) => {
      if (verdict === null) return { name, state: 'idle', word: words['notChecked'] };
      if (verdict === 'not-evaluated') return { name, state: 'none', word: words['notEvaluated'] };
      return verdict[name]
        ? { name, state: 'pass', word: words['pass'] }
        : { name, state: 'fail', word: words['fail'] };
    });
  });

  protected readonly status = computed(() => {
    const s = this.snap();
    if (!this.started()) return this.copy.status['idle'];
    if (!s.end) return this.copy.status['running'];
    return fill(this.copy.status[s.end], { tick: s.tick });
  });
  protected readonly noDeadlock = computed(
    () => this.mode() === 'unordered' && this.snap().end === 'done',
  );

  protected readonly stats = computed(() => {
    const s = this.snap();
    const t = this.copy.stats;
    return [
      { label: t['tick'], value: intl(s.tick) },
      { label: t['queue'], value: `${intl(s.queueDepth)} ${t['of']} ${intl(s.queueCapacity)}` },
      { label: t['outbox'], value: intl(s.outboxDepth) },
      { label: t['breaker'], value: this.copy.breakerStates[s.breaker] },
      { label: t['opens'], value: intl(s.opens) },
      { label: t['retries'], value: intl(s.retries) },
      { label: t['rejected'], value: intl(s.rejected) },
      { label: t['duplicates'], value: intl(s.duplicatesAnswered) },
      { label: t['lockWaits'], value: intl(s.lockWaits) },
      { label: t['casConflicts'], value: intl(s.casConflicts) },
      { label: t['postings'], value: intl(s.version) },
      { label: t['total'], value: intl(sum(s.balances)) },
      { label: t['openingTotal'], value: intl(sum(s.openingBalances)) },
    ];
  });
  protected readonly workers = computed(() =>
    this.snap().workers.map((w, i) => ({
      n: i + 1,
      state: w.state,
      word: this.copy.workers.states[w.state],
    })),
  );
  protected readonly accounts = computed(() => this.snap().locks.map((holder) => holder !== null));
  protected readonly lockedSummary = computed(() => {
    const cells = this.accounts();
    return fill(this.copy.accounts.summary, {
      locked: cells.filter(Boolean).length,
      total: cells.length,
    });
  });

  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly view = inject(ChangeDetectorRef);
  private frame = 0;
  private onScreen = true;
  private processed = 0;
  private keyLines: LogLine[] = [];
  private detailLines: LogLine[] = [];

  constructor() {
    // Browser only: nothing here runs during prerendering.
    afterNextRender(() => {
      const onVisibility = () => (this.document.hidden ? this.cancel() : this.schedule());
      this.document.addEventListener('visibilitychange', onVisibility);
      let observer: IntersectionObserver | undefined;
      if (typeof IntersectionObserver !== 'undefined') {
        observer = new IntersectionObserver((entries) => {
          const last = entries[entries.length - 1];
          if (!last) return;
          this.onScreen = last.isIntersecting;
          if (this.onScreen) this.schedule();
          else this.cancel();
        });
        observer.observe(this.host.nativeElement);
      }
      this.destroyRef.onDestroy(() => {
        this.document.removeEventListener('visibilitychange', onVisibility);
        observer?.disconnect();
      });
    });
    this.destroyRef.onDestroy(() => this.cancel());
  }

  protected choose(kind: 'mode' | 'fault', value: string): void {
    this.cancel();
    this.playing.set(false);
    if (kind === 'mode') this.mode.set(value as LabMode);
    else this.fault.set(value as LabFault);
    this.reset();
    this.view.detectChanges();
  }

  protected run(): void {
    if (this.playing()) return;
    this.reset();
    this.started.set(true);
    this.keyLines.push({
      i: RUN_START,
      text: fill(this.copy.log['start'] as string, {
        mode: this.copy.controls.modes[this.mode()],
        fault: this.copy.controls.faults[this.fault()],
        seed: this.seed(),
      }),
    });
    if (this.reducedMotion()) {
      while (!this.sim.snapshot.end) this.sim.step();
      this.sync();
      this.finish();
      this.view.detectChanges();
      return;
    }
    this.publishLines();
    this.playing.set(true);
    this.view.detectChanges();
    this.schedule();
  }

  private fresh(): SettlementSim {
    return new SettlementSim({ mode: this.mode(), fault: this.fault(), seed: this.seed() });
  }

  private reset(): void {
    this.sim = this.fresh();
    this.snap.set(this.sim.snapshot);
    this.verdict.set(null);
    this.started.set(false);
    this.processed = 0;
    this.keyLines = [];
    this.detailLines = [];
    this.lines.set([]);
  }

  private reducedMotion(): boolean {
    return (
      typeof matchMedia === 'function' && !!matchMedia('(prefers-reduced-motion: reduce)')?.matches
    );
  }

  private canRun(): boolean {
    return this.playing() && this.onScreen && !this.document.hidden;
  }

  private schedule(): void {
    if (this.frame !== 0 || !this.canRun()) return;
    this.frame = requestAnimationFrame(() => this.advance());
  }

  private cancel(): void {
    if (this.frame === 0) return;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private advance(): void {
    this.frame = 0;
    if (!this.canRun()) return;
    for (let n = 0; n < TICKS_PER_FRAME && !this.sim.snapshot.end; n++) this.sim.step();
    this.sync();
    if (this.sim.snapshot.end) this.finish();
    this.view.detectChanges();
    this.schedule();
  }

  private finish(): void {
    this.playing.set(false);
    this.verdict.set(checkInvariants(this.sim.runRecord));
    this.keyLines.push({
      i: RUN_END,
      text: fill(this.copy.log['end'] as string, { tick: this.sim.snapshot.tick }),
    });
    this.publishLines();
  }

  private sync(): void {
    this.snap.set(this.sim.snapshot);
    const events = this.sim.events;
    for (; this.processed < events.length; this.processed++) {
      this.read(events[this.processed], this.processed);
    }
    this.publishLines();
  }

  private read(event: LabEvent, i: number): void {
    const template = this.copy.log[event.code];
    if (typeof template !== 'string') return;
    const text = fill(template, {
      tick: event.tick,
      id: event.transferId ?? '',
      source: event.source ? this.copy.log.sources[event.source] : '',
    });
    if (KEY_EVENTS.has(event.code)) this.keyLines.push({ i, text });
    else if (DETAIL_EVENTS.has(event.code)) {
      this.detailLines.push({ i, text });
      if (this.detailLines.length > DETAIL_WINDOW) this.detailLines.shift();
    }
  }

  private publishLines(): void {
    this.lines.set([...this.keyLines, ...this.detailLines].sort((a, b) => a.i - b.i));
  }
}
