import { layoutDots } from './dot-layout';

interface Point {
  hx: number;
  hy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * The 404 dot field (REQ-UI-104): "404" drawn as dots. Decorative. It is drawn once, at once. With motion
 * allowed, a pointer pushes nearby dots and they spring back; the frame loop runs only while something moves
 * and stops when it settles (REQ-MOT-101, 103). Colours are read from tokens and again on theme change.
 */
export class DotField {
  private readonly ctx: CanvasRenderingContext2D | null;
  private points: Point[] = [];
  private width = 0;
  private height = 0;
  private radius = 1.5;
  private pointer: [number, number] | null = null;
  private frame = 0;
  private last = 0;
  private colours = { rest: '', moved: '' };
  private readonly cleanup: (() => void)[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly text: string,
    private readonly still: boolean,
  ) {
    this.ctx = canvas.getContext('2d');
    this.readColours();
    this.resize();

    if (!still) {
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

  /** Re-reads colours from the tokens and repaints (called when the theme changes). */
  refreshColours(): void {
    this.readColours();
    this.draw();
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.cleanup.forEach((fn) => fn());
  }

  private on(name: string, fn: (e: Event) => void): void {
    this.canvas.addEventListener(name, fn);
    this.cleanup.push(() => this.canvas.removeEventListener(name, fn));
  }

  private readColours(): void {
    const style = getComputedStyle(this.canvas.ownerDocument.documentElement);
    this.colours = {
      rest: style.getPropertyValue('--accent').trim(),
      moved: style.getPropertyValue('--amber').trim(),
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
    this.points = layoutDots(this.text, w, h).map((d) => ({
      hx: d.x,
      hy: d.y,
      x: d.x,
      y: d.y,
      vx: 0,
      vy: 0,
    }));
    this.radius = Math.max(1.5, Math.min(w / 130, 5.6) * 0.29);
    this.draw();
  }

  private wake(): void {
    if (this.frame || this.still) return;
    this.last = performance.now();
    this.frame = requestAnimationFrame((t) => this.tick(t));
  }

  private tick(t: number): void {
    this.frame = 0;
    const dt = Math.min(2, Math.max(0.2, (t - this.last) / 16.7));
    this.last = t;
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
    this.draw();
    // Settled (also with a pointer resting on the field): the loop ends until the next pointer move.
    if (moving) {
      this.wake();
    } else if (!this.pointer) {
      for (const p of this.points) {
        p.x = p.hx;
        p.y = p.hy;
        p.vx = p.vy = 0;
      }
      this.draw();
    }
  }

  private draw(): void {
    const { ctx, width, height, radius } = this;
    if (!ctx || !width) return;
    ctx.clearRect(0, 0, width, height);
    for (const moved of [false, true]) {
      ctx.fillStyle = moved ? this.colours.moved : this.colours.rest;
      ctx.beginPath();
      for (const p of this.points) {
        if (Math.abs(p.x - p.hx) + Math.abs(p.y - p.hy) > 7 !== moved) continue;
        ctx.moveTo(p.x + radius, p.y);
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }
}
