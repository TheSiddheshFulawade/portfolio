/**
 * A small seeded generator (mulberry32). Pure: the same seed always gives the same sequence, and every
 * generator has its own state. Each call returns a number in [0, 1). Simulations draw every random choice from
 * here (REQ-ACC-003), never from Math.random.
 */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
