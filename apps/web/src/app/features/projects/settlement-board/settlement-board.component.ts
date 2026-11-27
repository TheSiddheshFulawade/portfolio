import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { labContent } from '../../../core/content/lab-content';
import { ThemeService } from '../../../core/theme/theme.service';
import {
  BreakerState,
  InvariantName,
  LabEvent,
  LabFault,
  LabMode,
  SettlementSim,
  checkInvariants,
} from '../../../shared/sim/settlement.model';
import { BreakerPoint, DepthPoint, OutboxChart } from './outbox-chart';

/**
 * Model ticks per second of playback, the same for every mode (KNOWN-ERRORS M5): the longest finished run (CAS, about
 * 1,000 ticks) plays in about 2 s (REQ-MOT-101). Playback is time-based, so the rate does not depend on the display.
 */
const TICKS_PER_SECOND = 480;
/** A frame never advances more than this, so a stalled frame does not jump the run ahead. */
const MAX_FRAME_MS = 64;
/** The first frame after a start or a resume has no previous time: it plays one frame at 60 Hz. */
const FIRST_FRAME_MS = 1000 / 60;
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
/** How a log line is marked beside its text: held (amber), ok (accent), bad (red). The text always says it too. */
type LineKind = 'plain' | 'held' | 'ok' | 'bad';
const LINE_KIND: Readonly<Record<string, LineKind>> = {
  BREAKER_OPEN: 'held',
  BREAKER_HALF_OPEN: 'held',
  BREAKER_CLOSED: 'ok',
  DEADLOCK_DETECTED: 'bad',
  PUBLISH_FAILED: 'held',
  GL_NOT_PERMITTED: 'held',
};
const BREAKER_EVENT: Readonly<Record<string, BreakerState>> = {
  BREAKER_OPEN: 'open',
  BREAKER_HALF_OPEN: 'half-open',
  BREAKER_CLOSED: 'closed',
};

interface LogLine {
  readonly i: number;
  readonly text: string;
  readonly kind: LineKind;
}

const fill = (template: string, values: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
const intl = (n: number): string => n.toLocaleString('en-US');
const sum = (a: readonly number[]): number => a.reduce((x, y) => x + y, 0);

/**
 * The Settlement Lab board (REQ-PROJ-103, 105): a simplified model of settlement-lab, run in the browser. The model
 * (`SettlementSim`) owns every number and the six invariant checks; this component only steps it and draws its
 * snapshot as text and shapes. It never starts on load. The loop is requestAnimationFrame at one time-based rate and
 * runs only while a run is playing, the tab is visible and the board is on screen; time spent paused is not played
 * back (REQ-MOT-103). With reduced motion Run steps the model to its end at once, so the final text and numbers are
 * the same (REQ-MOT-102). The outbox chart is built from the model's own events, never from interpolation.
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
  /** The run's outcome, for the mark beside the status line: idle, running, done or stopped. */
  protected readonly outcome = computed(() => {
    const s = this.snap();
    if (!this.started()) return 'idle';
    if (!s.end) return 'running';
    return s.end === 'done' ? 'done' : 'stopped';
  });
  protected readonly noDeadlock = computed(
    () => this.mode() === 'unordered' && this.snap().end === 'done',
  );

  /** Counters beside the invariants. Queue, outbox and breaker have their own figures in the flow. */
  protected readonly stats = computed(() => {
    const s = this.snap();
    const t = this.copy.stats;
    return [
      { label: t['tick'], value: intl(s.tick) },
      { label: t['postings'], value: intl(s.version) },
      { label: t['rejected'], value: intl(s.rejected) },
      { label: t['duplicates'], value: intl(s.duplicatesAnswered) },
      { label: t['retries'], value: intl(s.retries) },
      { label: t['opens'], value: intl(s.opens) },
      { label: t['lockWaits'], value: intl(s.lockWaits) },
      { label: t['casConflicts'], value: intl(s.casConflicts) },
      { label: t['total'], value: intl(sum(s.balances)) },
      { label: t['openingTotal'], value: intl(sum(s.openingBalances)) },
    ];
  });
  protected readonly queueText = computed(() => {
    const s = this.snap();
    return `${intl(s.queueDepth)} ${this.copy.stats['of']} ${intl(s.queueCapacity)}`;
  });
  /** The queue meter as an SVG transform attribute (CSP: no style attribute), from the model's queue depth. */
  protected readonly queueScale = computed(() => {
    const s = this.snap();
    const f = s.queueCapacity ? Math.min(s.queueDepth / s.queueCapacity, 1) : 0;
    return `scale(${f.toFixed(4)} 1)`;
  });
  protected readonly outboxText = computed(() => intl(this.snap().outboxDepth));
  protected readonly breaker = computed(() => this.snap().breaker);
  protected readonly breakerWord = computed(() => this.copy.breakerStates[this.snap().breaker]);

  protected readonly workers = computed(() => {
    const s = this.snap();
    return s.workers.map((w, i) => ({
      n: i + 1,
      state: w.state,
      word: this.copy.workers.states[w.state],
      stuck: s.cycle.includes(i),
    }));
  });
  /** One cell per account in a 10-column SVG grid: locked or free, and whether a deadlocked worker holds it. */
  protected readonly accounts = computed(() => {
    const s = this.snap();
    return s.locks.map((holder, i) => ({
      x: (i % 10) * 10 + 1,
      y: Math.floor(i / 10) * 10 + 1,
      locked: holder !== null,
      stuck: holder !== null && s.cycle.includes(holder),
    }));
  });
  protected readonly lockedSummary = computed(() => {
    const cells = this.accounts();
    return fill(this.copy.accounts.summary, {
      locked: cells.filter((c) => c.locked).length,
      total: cells.length,
    });
  });

  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly view = inject(ChangeDetectorRef);
  private readonly chartRef = viewChild<ElementRef<HTMLCanvasElement>>('chart');
  private readonly logRef = viewChild<ElementRef<HTMLElement>>('log');
  private chart?: OutboxChart;
  private frame = 0;
  private last = -1;
  private carry = 0;
  private onScreen = true;
  private processed = 0;
  private keyLines: LogLine[] = [];
  private detailLines: LogLine[] = [];
  private depth = 0;
  private depthSeries: DepthPoint[] = [];
  private breakerSeries: BreakerPoint[] = [{ tick: 0, state: 'closed' }];

  constructor() {
    const theme = inject(ThemeService).theme;
    // Browser only: nothing here runs during prerendering.
    afterNextRender(() => {
      const canvas = this.chartRef()?.nativeElement;
      if (canvas) this.chart = new OutboxChart(canvas);
      this.drawChart();
      // With no saved choice the tokens follow the system scheme, which can change while the page is open.
      const scheme =
        typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null;
      const onScheme = () => this.chart?.refresh();
      scheme?.addEventListener?.('change', onScheme);
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
        scheme?.removeEventListener?.('change', onScheme);
        observer?.disconnect();
        this.chart?.destroy();
      });
    });
    // The theme service sets data-theme before this runs, so the tokens read back are the new ones.
    effect(() => {
      theme();
      this.chart?.refresh();
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
      kind: 'plain',
    });
    if (this.reducedMotion()) {
      while (!this.sim.snapshot.end) this.sim.step();
      this.sync();
      this.finish();
      this.view.detectChanges();
      this.followLog();
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
    this.carry = 0;
    this.last = -1;
    this.keyLines = [];
    this.detailLines = [];
    this.lines.set([]);
    this.depth = 0;
    this.depthSeries = [];
    this.breakerSeries = [{ tick: 0, state: 'closed' }];
    this.drawChart();
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
    this.frame = requestAnimationFrame((now) => this.advance(now));
  }

  /** Pauses the loop. Time spent hidden or off screen is not played back: the next frame starts a new interval. */
  private cancel(): void {
    this.last = -1;
    if (this.frame === 0) return;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private advance(now: number): void {
    this.frame = 0;
    if (!this.canRun()) return;
    const elapsed =
      this.last < 0 || now < this.last ? FIRST_FRAME_MS : Math.min(now - this.last, MAX_FRAME_MS);
    this.last = now;
    this.carry += (elapsed * TICKS_PER_SECOND) / 1000;
    for (; this.carry >= 1 && !this.sim.snapshot.end; this.carry--) this.sim.step();
    const follow = this.atLogEnd();
    this.sync();
    if (this.sim.snapshot.end) this.finish();
    this.view.detectChanges();
    if (follow) this.followLog();
    this.schedule();
  }

  private finish(): void {
    this.playing.set(false);
    this.carry = 0;
    this.last = -1;
    this.verdict.set(checkInvariants(this.sim.runRecord));
    this.keyLines.push({
      i: RUN_END,
      text: fill(this.copy.log['end'] as string, { tick: this.sim.snapshot.tick }),
      kind: 'plain',
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
    this.drawChart();
  }

  private read(event: LabEvent, i: number): void {
    if (event.code === 'OUTBOX_ENQUEUED' || event.code === 'OUTBOX_DELIVERED') {
      this.depth += event.code === 'OUTBOX_ENQUEUED' ? 1 : -1;
      this.depthSeries.push({ tick: event.tick, depth: this.depth });
    }
    const breaker = BREAKER_EVENT[event.code];
    if (breaker) this.breakerSeries.push({ tick: event.tick, state: breaker });
    const template = this.copy.log[event.code];
    if (typeof template !== 'string') return;
    const text = fill(template, {
      tick: event.tick,
      id: event.transferId ?? '',
      source: event.source ? this.copy.log.sources[event.source] : '',
    });
    const kind = LINE_KIND[event.code] ?? 'plain';
    if (KEY_EVENTS.has(event.code)) this.keyLines.push({ i, text, kind });
    else if (DETAIL_EVENTS.has(event.code)) {
      this.detailLines.push({ i, text, kind });
      if (this.detailLines.length > DETAIL_WINDOW) this.detailLines.shift();
    }
  }

  private publishLines(): void {
    this.lines.set([...this.keyLines, ...this.detailLines].sort((a, b) => a.i - b.i));
  }

  /** True when the log shows its last line, so new lines may keep it there; false once the reader scrolls up. */
  private atLogEnd(): boolean {
    const log = this.logRef()?.nativeElement;
    return !log || log.scrollHeight - log.scrollTop - log.clientHeight < 8;
  }

  /** Shows the newest log line. An instant jump, never smooth. */
  private followLog(): void {
    const log = this.logRef()?.nativeElement;
    if (log && log.scrollHeight > log.clientHeight) log.scrollTop = log.scrollHeight;
  }

  private drawChart(): void {
    this.chart?.set({
      tick: this.sim.snapshot.tick,
      depth: this.depthSeries,
      breaker: this.breakerSeries,
    });
  }
}
