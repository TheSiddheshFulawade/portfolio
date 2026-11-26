import { layoutField } from './dot-layout';
import type { EntryState, LedgerEntry } from '../sim/ledger-field.model';

/** The characters the invariant field draws: Σ = 0 (REQ-HOME-103). A symbol, not copy. */
export const FIELD_TEXT = 'Σ=0';

/** Dots in the field, fixed by the layout grid and independent of the canvas size. Two dots make one transaction. */
export const FIELD_DOTS = layoutField(FIELD_TEXT, 900, 360).length;

interface Point {
  hx: number;
  hy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * Draws the invariant field: one dot per ledger entry, in the layout's order, coloured by the model's state.
 * The canvas holds no ledger state. Pointer displacement is only a visual spring (a dot is pushed and returns);
 * nothing here is ever read back into a counter. Colours come from tokens and are read again on theme change.
 * The caller owns the frame loop: it calls `advance()` while `advance()` or the model say something moves.
 */
export class FieldCanvas {
  private readonly ctx: CanvasRenderingContext2D | null;
  private points: Point[] = [];
  private states: EntryState[] = [];
  private kinds: ('debit' | 'credit')[] = [];
  private width = 0;
  private height = 0;
  private radius = 1.5;
  private pointer: [number, number] | null = null;
  private colours = { debit: '', credit: '', unreachable: '', recovering: '' };
  private readonly cleanup: (() => void)[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    entries: readonly LedgerEntry[],
    interactive: boolean,
    private readonly wake: () => void,
  ) {
    this.ctx = canvas.getContext('2d');
    this.setEntries(entries);
    this.readColours();
    this.resize();

    if (interactive) {
      const at = (e: Event) => {
        const { clientX, clientY } = e as PointerEvent;
        const b = canvas.getBoundingClientRect();
        this.pointer = [clientX - b.left, clientY - b.top];
        this.wake();
      };
      const leave = () => {
        this.pointer = null;
        this.wake();
      };
      this.on('pointermove', (e) => {
        const p = e as PointerEvent;
        if (p.pointerType === 'mouse' || p.buttons) at(e);
      });
      this.on('pointerdown', at);
      for (const name of ['pointerleave', 'pointerup', 'pointercancel']) this.on(name, leave);
    }
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => this.resize());
      observer.observe(canvas);
      this.cleanup.push(() => observer.disconnect());
    }
  }

  /** Takes the entries' states and kinds (dot k is entry k) and repaints. */
  setEntries(entries: readonly LedgerEntry[]): void {
    this.states = entries.map((e) => e.state);
    this.kinds = entries.map((e) => e.kind);
    this.draw();
  }

  refreshColours(): void {
    this.readColours();
    this.draw();
  }

  /** Moves displaced dots back toward home for `ms` of real time. Returns true while anything still moves. */
  advance(ms: number): boolean {
    const dt = Math.min(2, Math.max(0.2, ms / 16.7));
    const reach = Math.max(34, this.width * 0.05);
    const damp = Math.pow(0.83, dt);
    let moving = false;
    for (const p of this.points) {
      let ax = (p.hx - p.x) * 0.045;
      let ay = (p.hy - p.y) * 0.045;
      if (this.pointer) {
        const dx = p.x - this.pointer[0];
        const dy = p.y - this.pointer[1];
        const d = Math.hypot(dx, dy) || 1;
        if (d < reach) {
          const k = (1 - d / reach) * 2.6;
          ax += (dx / d) * k;
          ay += (dy / d) * k;
        }
      }
      p.vx = (p.vx + ax * dt) * damp;
      p.vy = (p.vy + ay * dt) * damp;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (
        Math.abs(p.vx) + Math.abs(p.vy) > 0.03 ||
        Math.abs(p.hx - p.x) + Math.abs(p.hy - p.y) > 0.4
      ) {
        moving = true;
      }
    }
    if (!moving && !this.pointer) {
      for (const p of this.points) {
        p.x = p.hx;
        p.y = p.hy;
        p.vx = p.vy = 0;
      }
    }
    this.draw();
    // A pointer resting on the field keeps nothing moving: the loop ends until the next pointer move.
    return moving;
  }

  destroy(): void {
    this.cleanup.forEach((fn) => fn());
  }

  private on(name: string, fn: (e: Event) => void): void {
    this.canvas.addEventListener(name, fn);
    this.cleanup.push(() => this.canvas.removeEventListener(name, fn));
  }

  private readColours(): void {
    const style = getComputedStyle(this.canvas.ownerDocument.documentElement);
    const token = (name: string) => style.getPropertyValue(name).trim();
    this.colours = {
      debit: token('--accent'),
      credit: token('--text-strong'),
      unreachable: token('--amber'),
      recovering: token('--dim'),
    };
  }

  private resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!this.ctx || !w || !h || (w === this.width && h === this.height)) return;
    const ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
    this.width = w;
    this.height = h;
    this.canvas.width = w * ratio;
    this.canvas.height = h * ratio;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.points = layoutField(FIELD_TEXT, w, h).map((d) => ({
      hx: d.x,
      hy: d.y,
      x: d.x,
      y: d.y,
      vx: 0,
      vy: 0,
    }));
    this.radius = Math.max(0.9, Math.min(w / 340, 2.2));
    this.draw();
  }

  private draw(): void {
    const { ctx, width, height, radius } = this;
    if (!ctx || !width) return;
    ctx.clearRect(0, 0, width, height);
    const groups: [string, (i: number) => boolean][] = [
      [this.colours.debit, (i) => this.states[i] === 'reachable' && this.kinds[i] === 'debit'],
      [this.colours.credit, (i) => this.states[i] === 'reachable' && this.kinds[i] === 'credit'],
      [this.colours.unreachable, (i) => this.states[i] === 'unreachable'],
      [this.colours.recovering, (i) => this.states[i] === 'recovering'],
    ];
    for (const [colour, pick] of groups) {
      ctx.fillStyle = colour;
      ctx.beginPath();
      this.points.forEach((p, i) => {
        if (!pick(i)) return;
        ctx.moveTo(p.x + radius, p.y);
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      });
      ctx.fill();
    }
  }
}
