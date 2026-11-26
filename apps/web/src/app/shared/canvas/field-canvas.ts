import { layoutField } from './dot-layout';
import type { LedgerSnapshot } from '../sim/ledger-field.model';

/** The characters the invariant field draws: Σ = 0 (REQ-HOME-103). A symbol, not copy. */
export const FIELD_TEXT = 'Σ=0';

/** Dots in the field, fixed by the layout grid and independent of the canvas size. Two dots make one transaction. */
export const FIELD_DOTS = layoutField(FIELD_TEXT, 900, 360).length;

/** The glyph uses the top part of the canvas; the band below holds the entries of a node that is down. */
const GLYPH_SHARE = 0.8;
/** A redelivered pair's rings, once refused, fade out over this time. Visual only: the model has already decided. */
const RING_FADE_MS = 620;

interface Point {
  hx: number;
  hy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

type Colours = Record<
  'debit' | 'credit' | 'unreachable' | 'recovering' | 'partition' | 'arriving' | 'refused',
  string
>;

/**
 * Draws the invariant field: one dot per ledger entry, in the layout's order, as the model's snapshot says.
 * The canvas holds no ledger state and decides nothing: where a dot goes and what colour it has follow from the
 * snapshot alone (REQ-HOME-103).
 * - Node down: the down node's entries (state unreachable, then recovering) sit in a band below the glyph, a pair
 *   as a debit above its credit. Each pair flies home when the model marks it reachable, so in replay order.
 * - Partition: the far side's pairs are shifted right of a dashed line while the model says partitioned.
 * - Redelivery: one ring per entry of every pair in the snapshot's batch, a pair's two rings together, travelling
 *   in from the left; they turn to "refused" and fade once the model counts the duplicates.
 * Pointer displacement is a visual spring only (a dot is pushed and returns); nothing here feeds a counter.
 * Colours come from tokens and are read again on theme change. The caller owns the frame loop: it calls
 * `advance()` while `advance()` or the model say something moves.
 */
export class FieldCanvas {
  private readonly ctx: CanvasRenderingContext2D | null;
  private points: Point[] = [];
  private snap: LedgerSnapshot;
  private width = 0;
  private height = 0;
  private radius = 1.5;
  private pointer: [number, number] | null = null;
  private colours = {} as Colours;
  private readonly cleanup: (() => void)[] = [];

  /** Pair index → slot in the band below the glyph, for the node that is down. Empty otherwise. */
  private aside = new Map<number, number>();
  private asideCentre = 0;
  /** Redelivery rings: pair indexes, their horizontal offset from home, and their stage. */
  private ringPairs: number[] = [];
  private ringOffset = new Float32Array(0);
  private ringStage: 'off' | 'arriving' | 'refused' = 'off';
  private ringFade = 0;
  private duplicatesAtStart = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    snapshot: LedgerSnapshot,
    private readonly motion: boolean,
    private readonly wake: () => void,
  ) {
    this.ctx = canvas.getContext('2d');
    this.snap = snapshot;
    this.readColours();
    this.resize();

    if (motion) {
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

  /** Takes the model's snapshot (dot k is entry k) and repaints. Without motion, dots jump to where they belong. */
  setSnapshot(snapshot: LedgerSnapshot): void {
    this.snap = snapshot;
    this.trackNode();
    this.trackRings();
    if (!this.motion) {
      this.points.forEach((p, k) => {
        [p.x, p.y] = this.target(k);
        p.vx = p.vy = 0;
      });
    }
    this.draw();
  }

  refreshColours(): void {
    this.readColours();
    this.draw();
  }

  /** Moves dots toward where the snapshot puts them for `ms` of real time. Returns true while anything moves. */
  advance(ms: number): boolean {
    const dt = Math.min(2, Math.max(0.2, ms / 16.7));
    const reach = Math.max(34, this.width * 0.05);
    const damp = Math.pow(0.83, dt);
    let moving = false;
    this.points.forEach((p, k) => {
      const [tx, ty] = this.target(k);
      let ax = (tx - p.x) * 0.045;
      let ay = (ty - p.y) * 0.045;
      if (this.pointer) {
        const dx = p.x - this.pointer[0];
        const dy = p.y - this.pointer[1];
        const d = Math.hypot(dx, dy) || 1;
        if (d < reach) {
          const f = (1 - d / reach) * 2.6;
          ax += (dx / d) * f;
          ay += (dy / d) * f;
        }
      }
      p.vx = (p.vx + ax * dt) * damp;
      p.vy = (p.vy + ay * dt) * damp;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (Math.abs(p.vx) + Math.abs(p.vy) > 0.03 || Math.abs(tx - p.x) + Math.abs(ty - p.y) > 0.4) {
        moving = true;
      } else if (!this.pointer) {
        p.x = tx;
        p.y = ty;
        p.vx = p.vy = 0;
      }
    });
    if (this.ringStage === 'arriving') {
      for (let j = 0; j < this.ringOffset.length; j++) {
        const left = -this.ringOffset[j];
        if (left > 0) this.ringOffset[j] = -Math.max(0, left - Math.max(left * 0.12, 3.2) * dt);
      }
      moving = true;
    } else if (this.ringStage === 'refused') {
      this.ringFade += ms;
      if (this.ringFade >= RING_FADE_MS) this.clearRings();
      else moving = true;
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

  /** Remembers which pairs are on the node that went down, for as long as the model reports the failure. */
  private trackNode(): void {
    const { phase, pairs } = this.snap;
    if (phase !== 'down' && phase !== 'replaying') {
      this.aside.clear();
      return;
    }
    if (this.aside.size) return;
    pairs.forEach((pair, i) => {
      if (pair.state !== 'reachable') this.aside.set(i, this.aside.size);
    });
    this.placeAside();
  }

  /** Starts the rings when the model delivers a batch again, and marks them refused once it counts duplicates. */
  private trackRings(): void {
    const { redelivered, counters, pairs } = this.snap;
    if (this.ringStage === 'off' && redelivered.length) {
      this.ringPairs = redelivered.map((id) => id - 1).filter((i) => i >= 0 && i < pairs.length);
      this.duplicatesAtStart = counters.duplicatesNotApplied;
      this.ringFade = 0;
      this.ringStage = this.motion ? 'arriving' : 'off';
      this.ringOffset = new Float32Array(this.ringPairs.length);
      this.ringPairs.forEach((i, j) => {
        const home = this.points[2 * i];
        this.ringOffset[j] = -((home?.hx ?? 0) + 10 + (j % 40) * 6);
      });
    }
    if (this.ringStage === 'arriving') {
      if (counters.duplicatesNotApplied > this.duplicatesAtStart) {
        this.ringStage = 'refused';
      } else if (!redelivered.length) {
        this.clearRings();
      }
    }
  }

  private clearRings(): void {
    this.ringStage = 'off';
    this.ringPairs = [];
    this.ringOffset = new Float32Array(0);
  }

  /** Where entry k belongs now, by the snapshot: home, the band below the glyph, or shifted past the partition. */
  private target(k: number): [number, number] {
    const p = this.points[k];
    if (!p) return [0, 0];
    const i = k >> 1;
    const pair = this.snap.pairs[i];
    if (!pair || pair.state === 'reachable') return [p.hx, p.hy];
    const slot = this.aside.get(i);
    if (slot !== undefined) return this.asidePosition(slot, k & 1);
    if (this.snap.phase === 'partitioned' && pair.side === 'far')
      return [p.hx + this.shift(), p.hy];
    return [p.hx, p.hy];
  }

  private spacing(): number {
    return this.radius * 2.6;
  }

  /** Centres the band's block of pairs under the down node's part of the glyph, inside the canvas. */
  private placeAside(): void {
    let sum = 0;
    for (const i of this.aside.keys()) sum += this.points[2 * i]?.hx ?? 0;
    this.asideCentre = this.aside.size ? sum / this.aside.size : this.width / 2;
  }

  /** A pair's slot in the band: columns of dominoes, the debit above its credit. */
  private asidePosition(slot: number, credit: number): [number, number] {
    const sp = this.spacing();
    const top = this.height * GLYPH_SHARE;
    const band = Math.max(2 * sp, this.height - top - sp * 2);
    const rows = Math.max(1, Math.floor(band / (2 * sp)));
    const cols = Math.ceil(this.aside.size / rows);
    const blockWidth = (cols - 1) * sp;
    const margin = sp * 2;
    const left = Math.min(
      Math.max(margin, this.asideCentre - blockWidth / 2),
      Math.max(margin, this.width - margin - blockWidth),
    );
    const col = slot % cols;
    const row = Math.floor(slot / cols);
    return [left + col * sp, top + sp + (row * 2 + credit) * sp];
  }

  /** How far the far side moves right during a partition: inside the canvas edge. */
  private shift(): number {
    const right = this.points.length ? this.points[this.points.length - 1].hx : this.width;
    return Math.max(0, Math.min(this.width * 0.045, this.width - right - this.radius * 2 - 4));
  }

  /** The partition line: halfway between the last near-side dot and the first far-side dot, moved with the far side. */
  private partitionX(): number | null {
    const { pairs } = this.snap;
    const first = pairs.findIndex((p) => p.side === 'far');
    if (first <= 0) return null;
    const near = this.points[2 * first - 1];
    const far = this.points[2 * first];
    if (!near || !far) return null;
    return (near.hx + far.hx + this.shift()) / 2;
  }

  private readColours(): void {
    const style = getComputedStyle(this.canvas.ownerDocument.documentElement);
    const token = (name: string) => style.getPropertyValue(name).trim();
    this.colours = {
      debit: token('--accent'),
      credit: token('--text-strong'),
      unreachable: token('--amber'),
      recovering: token('--dim'),
      partition: token('--control'),
      arriving: token('--amber'),
      refused: token('--red'),
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
    this.radius = Math.max(0.9, Math.min(w / 340, 2.2));
    this.points = layoutField(FIELD_TEXT, w, h * GLYPH_SHARE).map((d) => ({
      hx: d.x,
      hy: d.y,
      x: d.x,
      y: d.y,
      vx: 0,
      vy: 0,
    }));
    this.placeAside();
    this.points.forEach((p, k) => ([p.x, p.y] = this.target(k)));
    this.draw();
  }

  private draw(): void {
    const { ctx, width, height, radius, colours, snap } = this;
    if (!ctx || !width) return;
    ctx.clearRect(0, 0, width, height);

    const line = snap.phase === 'partitioned' ? this.partitionX() : null;
    if (line !== null) {
      ctx.strokeStyle = colours.partition;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(line, 12);
      ctx.lineTo(line, height - 12);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const groups: [string, (k: number) => boolean][] = [
      [colours.debit, (k) => this.state(k) === 'reachable' && (k & 1) === 0],
      [colours.credit, (k) => this.state(k) === 'reachable' && (k & 1) === 1],
      [colours.unreachable, (k) => this.state(k) === 'unreachable'],
      [colours.recovering, (k) => this.state(k) === 'recovering'],
    ];
    for (const [colour, pick] of groups) {
      ctx.fillStyle = colour;
      ctx.beginPath();
      this.points.forEach((p, k) => {
        if (!pick(k)) return;
        ctx.moveTo(p.x + radius, p.y);
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      });
      ctx.fill();
    }

    if (this.ringStage !== 'off') {
      const refused = this.ringStage === 'refused';
      ctx.globalAlpha = refused ? Math.max(0, 1 - this.ringFade / RING_FADE_MS) : 0.85;
      ctx.strokeStyle = refused ? colours.refused : colours.arriving;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const r = radius + 0.8;
      this.ringPairs.forEach((i, j) => {
        for (const k of [2 * i, 2 * i + 1]) {
          const home = this.points[k];
          if (!home) continue;
          const x = home.hx + this.ringOffset[j];
          if (x < -r) continue;
          ctx.moveTo(x + r, home.hy);
          ctx.arc(x, home.hy, r, 0, Math.PI * 2);
        }
      });
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /** Entry k's state: both entries of a pair share it (the model's entries are debit, credit per pair). */
  private state(k: number): string | undefined {
    return this.snap.entries[k]?.state;
  }
}
