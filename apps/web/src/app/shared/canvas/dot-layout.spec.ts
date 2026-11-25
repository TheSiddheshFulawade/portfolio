import { layoutDots } from './dot-layout';

// REQ-UI-104: the 404 dot field is laid out by a pure function (no DOM, no canvas, no clock).
// Assumed API: layoutDots(text, width, height) returns one { x, y } per dot, in canvas pixels.
describe('layoutDots', () => {
  const W = 600;
  const H = 300;

  it('REQ-UI-104 draws "404" as dots: some, all distinct, all inside the canvas', () => {
    const dots = layoutDots('404', W, H);

    expect(dots.length).toBeGreaterThan(20);
    expect(new Set(dots.map((d) => `${d.x},${d.y}`)).size).toBe(dots.length);
    for (const d of dots) {
      expect(Number.isFinite(d.x) && Number.isFinite(d.y)).toBe(true);
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(d.x).toBeLessThanOrEqual(W);
      expect(d.y).toBeGreaterThanOrEqual(0);
      expect(d.y).toBeLessThanOrEqual(H);
    }
  });

  it('REQ-UI-104 is deterministic: the same input gives the same dots in the same order', () => {
    expect(layoutDots('404', W, H)).toEqual(layoutDots('404', W, H));
  });

  it('REQ-UI-104 each glyph contributes its own dots: count("404") = 2 x count("4") + count("0")', () => {
    const count = (t: string) => layoutDots(t, W, H).length;

    expect(count('4')).toBeGreaterThan(0);
    expect(count('0')).toBeGreaterThan(0);
    expect(count('404')).toBe(2 * count('4') + count('0'));
  });

  it('REQ-UI-104 is centred horizontally and reads left to right (4, 0, 4)', () => {
    const dots = layoutDots('404', W, H);
    const xs = dots.map((d) => d.x);
    const left = Math.min(...xs);
    const right = Math.max(...xs);

    expect(Math.abs((left + right) / 2 - W / 2)).toBeLessThanOrEqual(W * 0.03);
    // The two 4s are the same shape, so the first third of the dots mirrors the last third's pattern.
    const third = (right - left) / 3;
    const shape = (from: number, to: number) => dots.filter((d) => d.x >= from && d.x <= to).length;
    expect(shape(left, left + third * 0.9)).toBeGreaterThan(0);
    expect(shape(right - third * 0.9, right)).toBeGreaterThan(0);
  });

  it('REQ-UI-104 scales with the canvas: twice the size, same dots at twice the position', () => {
    const small = layoutDots('404', 400, 200);
    const large = layoutDots('404', 800, 400);

    expect(large.length).toBe(small.length);
    small.forEach((d, i) => {
      expect(large[i].x).toBeCloseTo(d.x * 2, 0);
      expect(large[i].y).toBeCloseTo(d.y * 2, 0);
    });
  });

  it('REQ-UI-104 never overflows a narrow canvas (320 px)', () => {
    for (const d of layoutDots('404', 320, 160)) {
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(d.x).toBeLessThanOrEqual(320);
    }
  });

  it('REQ-UI-104 gives no dots for empty text or a canvas with no size, instead of throwing', () => {
    expect(layoutDots('', W, H)).toEqual([]);
    expect(layoutDots('404', 0, 0)).toEqual([]);
  });
});
