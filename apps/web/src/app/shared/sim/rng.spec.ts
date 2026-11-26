import { createRng } from './rng';

// REQ-ACC-003: simulations are seeded and pure, so every random choice comes from this generator.
// Assumed API: createRng(seed: number): () => number, each call in [0, 1).
describe('createRng', () => {
  const take = (seed: number, n: number) => {
    const next = createRng(seed);
    return Array.from({ length: n }, () => next());
  };

  it('REQ-ACC-003 the same seed gives the same sequence', () => {
    expect(take(42, 200)).toEqual(take(42, 200));
  });

  it('REQ-ACC-003 different seeds give different sequences', () => {
    expect(take(1, 20)).not.toEqual(take(2, 20));
    expect(take(0, 20)).not.toEqual(take(1, 20));
  });

  it('REQ-ACC-003 every value is a finite number in [0, 1), for edge-case seeds too', () => {
    for (const seed of [0, 1, -1, 7, 2 ** 31, 2 ** 32 - 1, 123456789]) {
      for (const v of take(seed, 2000)) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    }
  });

  it('REQ-ACC-003 it is not constant and is roughly uniform (mean near 0.5, both halves used)', () => {
    const values = take(2026, 10_000);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;

    expect(new Set(values).size).toBeGreaterThan(9_000);
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
    expect(values.filter((v) => v < 0.5).length).toBeGreaterThan(4_500);
    expect(values.filter((v) => v >= 0.5).length).toBeGreaterThan(4_500);
  });

  it('REQ-ACC-003 two generators do not share state: interleaving does not change either sequence', () => {
    const a = createRng(5);
    const b = createRng(9);
    const mixedA: number[] = [];
    const mixedB: number[] = [];
    for (let i = 0; i < 50; i++) {
      mixedA.push(a());
      mixedB.push(b());
      b();
    }

    expect(mixedA).toEqual(take(5, 50));
    const soloB = take(9, 100);
    expect(mixedB).toEqual(soloB.filter((_, i) => i % 2 === 0));
  });
});
