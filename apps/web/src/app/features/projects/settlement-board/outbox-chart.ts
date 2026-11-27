import { BreakerState } from '../../../shared/sim/settlement.model';

/** A change of the outbox depth, read from the model's OUTBOX_ENQUEUED and OUTBOX_DELIVERED events. */
export interface DepthPoint {
  readonly tick: number;
  readonly depth: number;
}
/** A breaker transition, read from the model's BREAKER_* events. */
export interface BreakerPoint {
  readonly tick: number;
  readonly state: BreakerState;
}
export interface ChartSeries {
  readonly tick: number;
  readonly depth: readonly DepthPoint[];
  readonly breaker: readonly BreakerPoint[];
}

interface Colours {
  line: string;
  rule: string;
  label: string;
  held: string;
  font: string;
}

const TOP = 16;
const BAND = 8;
const GAP = 6;
const MIN_DEPTH = 4;

/**
 * Outbox depth over model ticks, with the breaker state as a band under it (open solid, half-open hatched). It draws
 * only points the model emitted; nothing is interpolated. The x axis spans the ticks run so far, so it grows with the
 * run and stops when the run ends. Colours are tokens, read again on theme change (`refresh`). The canvas is
 * decorative for assistive technology: the same numbers are in the counters and the step log.
 */
export class OutboxChart {
  private readonly ctx: CanvasRenderingContext2D | null;
  private colours: Colours = { line: '', rule: '', label: '', held: '', font: '' };
  private width = 0;
  private height = 0;
  private series: ChartSeries = { tick: 0, depth: [], breaker: [] };
  private readonly observer?: ResizeObserver;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext?.('2d') ?? null;
    this.readColours();
    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(canvas);
    }
  }

  set(series: ChartSeries): void {
    this.series = series;
    this.draw();
  }

  refresh(): void {
    this.readColours();
    this.draw();
  }

  destroy(): void {
    this.observer?.disconnect();
  }

  private readColours(): void {
    const style = getComputedStyle(this.canvas);
    const token = (name: string) => style.getPropertyValue(name).trim();
    this.colours = {
      line: token('--accent'),
      rule: token('--line-2'),
      label: token('--dim'),
      held: token('--amber'),
      font: `0.75rem ${token('--font-mono') || 'monospace'}`,
    };
  }

  private resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!this.ctx || !w || !h || (w === this.width && h === this.height)) return;
    const ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
    this.width = w;
    this.height = h;
    this.canvas.width = Math.round(w * ratio);
    this.canvas.height = Math.round(h * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.draw();
  }

  private draw(): void {
    const { ctx, width, height, colours, series } = this;
    if (!ctx || !width || !height) return;
    ctx.clearRect(0, 0, width, height);

    const span = Math.max(series.tick, 1);
    const peak = series.depth.reduce((m, p) => Math.max(m, p.depth), 0);
    const top = Math.max(peak, MIN_DEPTH);
    const base = height - BAND - GAP;
    const x = (tick: number) => (Math.min(tick, span) / span) * width;
    const y = (depth: number) => base - (depth / top) * (base - TOP);

    // Scale: the base line and the peak, labelled with the model's own number.
    ctx.lineWidth = 1;
    ctx.strokeStyle = colours.rule;
    ctx.beginPath();
    ctx.moveTo(0, base + 0.5);
    ctx.lineTo(width, base + 0.5);
    ctx.stroke();
    if (peak > 0) {
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y(peak)) + 0.5);
      ctx.lineTo(width, Math.round(y(peak)) + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = colours.label;
      ctx.font = colours.font;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(peak.toLocaleString('en-US'), width, Math.round(y(peak)) - 2);
    }

    // Breaker band: open is solid, half-open is hatched, closed is empty.
    const band = height - BAND;
    series.breaker.forEach((p, i) => {
      if (p.state === 'closed') return;
      const from = x(p.tick);
      const to = x(series.breaker[i + 1]?.tick ?? series.tick);
      const w = Math.max(to - from, 1);
      ctx.fillStyle = colours.held;
      if (p.state === 'open') {
        ctx.fillRect(from, band, w, BAND);
        return;
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(from, band, w, BAND);
      ctx.clip();
      ctx.strokeStyle = colours.held;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let s = from - BAND; s < from + w; s += 4) {
        ctx.moveTo(s, band + BAND);
        ctx.lineTo(s + BAND, band);
      }
      ctx.stroke();
      ctx.restore();
    });

    // Outbox depth as a step line: it changes only at the ticks where the model enqueued or delivered.
    if (series.depth.length === 0) return;
    ctx.strokeStyle = colours.line;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let depth = 0;
    ctx.moveTo(0, y(0));
    for (const p of series.depth) {
      ctx.lineTo(x(p.tick), y(depth));
      ctx.lineTo(x(p.tick), y(p.depth));
      depth = p.depth;
    }
    ctx.lineTo(x(series.tick), y(depth));
    ctx.stroke();
  }
}
