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
  signal,
  viewChild,
} from '@angular/core';
import { homeContent } from '../../core/content/home-content';
import { FieldContent } from '../../core/content/content.types';
import { ThemeService } from '../../core/theme/theme.service';
import { FIELD_DOTS, FieldCanvas } from '../../shared/canvas/field-canvas';
import { FailMode, LedgerField } from '../../shared/sim/ledger-field.model';

/** One model tick every 150 ms: the longest run is about 3.2 s, under the 5 s limit (REQ-MOT-101). */
const TICK_MS = 150;
/** Fixed seed: the prerendered counters and the live ones come from the same model. */
const SEED = 2026;

type StatusKey = keyof FieldContent['status'];
type CounterKey = keyof FieldContent['counters'];

/**
 * The invariant field (REQ-HOME-103): Σ = 0 drawn as one dot per ledger entry, with three failures to inject.
 * The model (`LedgerField`) owns every number; this component times it, shows its counters as text and lets the
 * canvas draw it. The loop is requestAnimationFrame, time based, and runs only while a failure is active or a
 * displaced dot is still returning: not at rest, not off screen, not in a hidden tab (REQ-MOT-103).
 */
@Component({
  selector: 'sf-invariant-field',
  templateUrl: './invariant-field.component.html',
  styleUrl: './invariant-field.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvariantFieldComponent {
  protected readonly copy = homeContent.field;
  protected readonly modes = ['node', 'partition', 'duplicate'] as const;
  protected readonly counterKeys: CounterKey[] = [
    'committed',
    'reachable',
    'unreachable',
    'recovering',
    'duplicates',
    'net',
  ];

  private readonly model = new LedgerField(FIELD_DOTS / 2, SEED);
  private readonly snap = signal(this.model.snapshot);
  private readonly statusKey = signal<StatusKey>('rest');
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('field');
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly view = inject(ChangeDetectorRef);

  protected readonly busy = signal(false);
  protected readonly status = computed(() => this.copy.status[this.statusKey()]);
  protected readonly values = computed(() => {
    const c = this.snap().counters;
    return {
      committed: c.committed,
      reachable: c.reachable,
      unreachable: c.unreachable,
      recovering: c.recovering,
      duplicates: c.duplicatesNotApplied,
      net: c.netAll,
    };
  });

  private canvas?: FieldCanvas;
  private frame = 0;
  private last: number | null = null;
  private carry = 0;
  private onScreen = true;

  constructor() {
    const theme = inject(ThemeService).theme;

    afterNextRender(() => {
      const still = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      this.canvas = new FieldCanvas(this.canvasRef().nativeElement, this.snap(), !still, () =>
        this.schedule(),
      );
      if (typeof IntersectionObserver !== 'undefined') {
        const observer = new IntersectionObserver((entries) => {
          this.onScreen = entries.some((e) => e.isIntersecting);
          if (this.onScreen) this.schedule();
        });
        observer.observe(this.canvasRef().nativeElement);
        this.destroyRef.onDestroy(() => observer.disconnect());
      }
      const visibility = () => this.schedule();
      this.document.addEventListener('visibilitychange', visibility);
      this.destroyRef.onDestroy(() =>
        this.document.removeEventListener('visibilitychange', visibility),
      );
    });
    // The theme change is applied to the page before this runs, so the tokens read back are the new ones.
    effect(() => {
      theme();
      this.canvas?.refreshColours();
    });
    this.destroyRef.onDestroy(() => {
      if (this.frame) cancelAnimationFrame(this.frame);
      this.canvas?.destroy();
    });
  }

  protected value(key: CounterKey): string {
    return this.values()[key].toLocaleString('en-US').replace('-', '−');
  }

  protected run(mode: FailMode): void {
    if (this.busy() || !this.model.fail(mode)) return;
    this.statusKey.set(mode);
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      // Reduced motion: the final state, counters and text at once (REQ-MOT-102).
      while (!this.model.atRest) this.model.step();
      this.sync();
      return;
    }
    this.busy.set(true);
    this.sync();
    this.schedule();
  }

  /** Publishes the model's state: counters, status text and the canvas. */
  private sync(): void {
    const snap = this.model.snapshot;
    this.snap.set(snap);
    this.canvas?.setSnapshot(snap);
    if (!this.model.atRest) {
      if (snap.phase === 'replaying' && this.statusKey() === 'node')
        this.statusKey.set('nodeReplay');
    } else {
      const done = this.statusKey();
      if (done === 'node' || done === 'nodeReplay') {
        this.statusKey.set('nodeDone');
      } else if (done === 'partition' || done === 'duplicate') {
        this.statusKey.set(`${done}Done`);
      }
      if (this.busy()) {
        this.busy.set(false);
      }
    }
    // The frame loop is not an Angular event: update the view now, so text and counters never lag the canvas.
    this.view.detectChanges();
  }

  private schedule(): void {
    if (this.frame || !this.canvas || !this.onScreen || this.document.hidden) return;
    this.frame = requestAnimationFrame((t) => this.tick(t));
  }

  private tick(t: number): void {
    this.frame = 0;
    if (!this.onScreen || this.document.hidden) {
      this.last = null;
      return;
    }
    const elapsed = this.last === null ? 0 : Math.min(t - this.last, TICK_MS);
    this.last = t;
    if (!this.model.atRest) {
      this.carry += elapsed;
      if (this.carry >= TICK_MS) {
        this.carry -= TICK_MS;
        this.model.step();
        this.sync();
      }
    }
    const moving = this.canvas?.advance(elapsed) ?? false;
    if (this.model.atRest && !moving) {
      this.last = null;
      this.carry = 0;
    } else {
      this.schedule();
    }
  }
}
