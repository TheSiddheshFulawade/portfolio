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
  viewChild,
} from '@angular/core';
import { sagaContent } from '../../../core/content/saga-content';
import { SagaSim, SCENARIO_LABELS, type Scenario } from '../../../shared/sim/saga.model';

/**
 * Model steps per second of playback. The longest scenario has 20 steps, so every run ends in 4 s (REQ-MOT-101).
 * Playback is time-based: the rate does not depend on the display.
 */
const STEPS_PER_SECOND = 5;
/** A frame never advances more than this, so a stalled frame does not jump the run ahead. */
const MAX_FRAME_MS = 250;
/** The first frame after a start or a resume has no previous time: it plays one frame at 60 Hz. */
const FIRST_FRAME_MS = 1000 / 60;

const SCENARIOS: readonly Scenario[] = [
  'completes',
  'wallet-crash',
  'duplicate-delivery',
  'risk-rejection',
  'broker-outage',
  'insufficient-funds',
];
/** How a log line is marked beside its text: held (amber) or ok (accent). The text always says it too. */
type LineKind = 'plain' | 'held' | 'ok';
const LINE_KIND: Readonly<Record<string, LineKind>> = {
  BROKER_DOWN: 'held',
  WALLET_DOWN: 'held',
  DUPLICATE_DROPPED: 'held',
  REPLY_IGNORED: 'held',
  BROKER_UP: 'ok',
  WALLET_UP: 'ok',
};

interface LogLine {
  readonly i: number;
  readonly text: string;
  readonly kind: LineKind;
}

const fill = (template: string, values: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
const intl = (n: number): string => n.toLocaleString('en-US');

/**
 * The PayFlow board (REQ-PROJ-102, 105): the saga run as a small model in the browser. The model (`SagaSim`)
 * owns every number; this component only steps it and draws its snapshot and events as text. It never starts on
 * load. The loop is requestAnimationFrame at one time-based rate and runs only while a run is playing, the tab is
 * visible and the board is on screen; time spent paused is not played back (REQ-MOT-103). With reduced motion Run
 * steps the model to its end at once, so the final text and numbers are the same (REQ-MOT-102).
 */
@Component({
  selector: 'sf-saga-board',
  templateUrl: './saga-board.component.html',
  styleUrl: './saga-board.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SagaBoardComponent {
  readonly seed = input(20_261_127);

  protected readonly copy = sagaContent.board;
  protected readonly scenarios = SCENARIOS;
  protected readonly labels = SCENARIO_LABELS;

  protected readonly scenario = signal<Scenario>('completes');
  protected readonly playing = signal(false);
  private readonly started = signal(false);
  private readonly finished = signal(false);

  private sim = this.fresh();
  protected readonly snap = signal(this.sim.snapshot);
  protected readonly lines = signal<readonly LogLine[]>([]);

  protected readonly label = computed(() => SCENARIO_LABELS[this.scenario()]);
  protected readonly buttonText = computed(() => {
    if (this.playing()) return this.copy.controls['pause'];
    if (this.started() && !this.finished()) return this.copy.controls['resume'];
    return this.copy.controls['run'];
  });
  protected readonly status = computed(() => {
    if (!this.started()) return this.copy.status['idle'];
    if (this.finished()) return fill(this.copy.status['done'], { state: this.snap().state });
    return this.playing() ? this.copy.status['running'] : this.copy.status['paused'];
  });
  protected readonly money = computed(() => {
    const w = this.snap().wallets;
    return {
      payer: { available: intl(w.payer.available), held: intl(w.payer.held) },
      payee: { available: intl(w.payee.available), held: intl(w.payee.held) },
      sigma: intl(w.payer.available + w.payer.held + w.payee.available + w.payee.held),
    };
  });
  protected readonly counts = computed(() => {
    const s = this.snap();
    return (['payment', 'wallet', 'risk'] as const).map((svc) => ({
      svc,
      name: this.copy.services[svc],
      inbox: intl(s.inbox[svc]),
      outbox: intl(s.outbox[svc]),
    }));
  });

  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly view = inject(ChangeDetectorRef);
  private readonly logRef = viewChild<ElementRef<HTMLElement>>('log');
  private frame = 0;
  private last = -1;
  private carry = 0;
  private onScreen = true;
  private processed = 0;
  private logLines: LogLine[] = [];

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

  protected choose(value: string): void {
    this.cancel();
    this.playing.set(false);
    this.scenario.set(value as Scenario);
    this.reset();
    this.view.detectChanges();
  }

  /** Run, Pause and Resume share one button. */
  protected toggle(): void {
    if (this.playing()) {
      this.cancel();
      this.playing.set(false);
      return;
    }
    if (this.started() && !this.finished()) {
      this.playing.set(true);
      this.schedule();
      return;
    }
    this.run();
  }

  private run(): void {
    this.reset();
    this.started.set(true);
    if (this.reducedMotion()) {
      while (!this.sim.done) this.sim.step();
      this.sync();
      this.finish();
      this.view.detectChanges();
      return;
    }
    this.playing.set(true);
    this.view.detectChanges();
    this.schedule();
  }

  private fresh(): SagaSim {
    return new SagaSim(this.scenario(), this.seed());
  }

  private reset(): void {
    this.sim = this.fresh();
    this.snap.set(this.sim.snapshot);
    this.started.set(false);
    this.finished.set(false);
    this.processed = 0;
    this.carry = 0;
    this.last = -1;
    this.logLines = [];
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
    this.frame = requestAnimationFrame((now) => this.advance(now));
  }

  /** Pauses the loop. Time spent hidden, off screen or paused is not played back: the next frame starts afresh. */
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
    this.carry += (elapsed * STEPS_PER_SECOND) / 1000;
    for (; this.carry >= 1 && !this.sim.done; this.carry--) this.sim.step();
    const follow = this.atLogEnd();
    this.sync();
    if (this.sim.done) this.finish();
    this.view.detectChanges();
    if (follow) this.followLog();
    this.schedule();
  }

  private finish(): void {
    this.playing.set(false);
    this.finished.set(true);
    this.carry = 0;
    this.last = -1;
  }

  private sync(): void {
    this.snap.set(this.sim.snapshot);
    const events = this.sim.events;
    for (; this.processed < events.length; this.processed++) {
      const e = events[this.processed];
      this.logLines.push({
        i: this.processed,
        text: fill(this.copy.events[e.code], {
          service: this.copy.services[e.service],
          type: e.type ?? '',
          id: e.messageId ?? '',
          attempt: e.attempt ?? '',
        }),
        kind: LINE_KIND[e.code] ?? 'plain',
      });
    }
    this.lines.set([...this.logLines]);
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
}
