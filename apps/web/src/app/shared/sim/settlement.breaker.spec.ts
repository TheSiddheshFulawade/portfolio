import * as model from './settlement.model';

// REQ-PROJ-103, REQ-RD-07 F6c: the circuit breaker of the Settlement Lab model as a small exported pure class, traced by
// hand against Resilience4j (CircuitBreakerConfig defaults used by settlement-lab's ResilienceConfig.defaults):
// count-based sliding window 20, minimumNumberOfCalls 10, failureRateThreshold 50 (opens at >= 50 %),
// permittedNumberOfCallsInHalfOpenState 3 (decided only after all 3 probes are recorded). https://resilience4j.readme.io/docs/circuitbreaker
//
// Contract the implementation must export from settlement.model.ts (SettlementSim uses it for every publish):
//   export class Breaker {
//     constructor(config?: Partial<{ window: number; minCalls: number; failurePercent: number; probes: number }>)
//       // defaults: window 20, minCalls 10, failurePercent 50, probes 3
//     get state(): BreakerState                     // starts 'closed'
//     permits(): boolean                            // false only while 'open'
//     record(ok: boolean): BreakerState | null      // one outcome per publish; the NEW state on a transition, else null.
//                                                   // While 'open' it is ignored (returns null, changes nothing).
//     halfOpen(): boolean                           // open -> half-open (fresh probe count); true if it changed, else false
//   }
// A transition clears the window and the probes. The model decides when to call halfOpen() (OPEN_WAIT 90 ticks, when the
// relay next calls); the class has no clock.

interface BreakerLike {
  readonly state: 'closed' | 'open' | 'half-open';
  permits(): boolean;
  record(ok: boolean): 'closed' | 'open' | 'half-open' | null;
  halfOpen(): boolean;
}
type BreakerCtor = new (config?: object) => BreakerLike;
const Breaker = (model as unknown as { Breaker: BreakerCtor }).Breaker;

const feed = (b: BreakerLike, calls: boolean[]) => calls.map((ok) => b.record(ok));
const openIt = (b: BreakerLike) => feed(b, Array(10).fill(false));

describe('REQ-PROJ-103 F6c Breaker (Resilience4j rule, hand traced)', () => {
  it('REQ-PROJ-103 F6c Breaker is exported from settlement.model', () => {
    expect(typeof Breaker).toBe('function');
  });

  it('REQ-PROJ-103 F6c starts closed and permits calls; halfOpen() on a closed breaker changes nothing', () => {
    const b = new Breaker();

    expect(b.state).toBe('closed');
    expect(b.permits()).toBe(true);
    expect(b.halfOpen()).toBe(false);
    expect(b.state).toBe('closed');
  });

  it('REQ-PROJ-103 F6c 5 failures in 10 calls (50 %, the minimum) open it, on the 10th call and not before', () => {
    const b = new Breaker();
    const out = feed(b, [true, false, true, false, true, false, true, false, true, false]);

    expect(out.slice(0, 9)).toEqual(Array(9).fill(null));
    expect(out[9]).toBe('open');
    expect(b.state).toBe('open');
    expect(b.permits()).toBe(false);
  });

  it('REQ-PROJ-103 F6c 4 failures in 10 calls (40 %) stay closed', () => {
    const b = new Breaker();

    expect(feed(b, [true, false, true, false, true, false, true, false, true, true])).toEqual(Array(10).fill(null));
    expect(b.state).toBe('closed');
  });

  it('REQ-PROJ-103 F6c 9 calls never open it, even when all 9 failed; the 10th failure does', () => {
    const b = new Breaker();

    expect(feed(b, Array(9).fill(false))).toEqual(Array(9).fill(null));
    expect(b.state).toBe('closed');
    expect(b.record(false)).toBe('open');
  });

  it('REQ-PROJ-103 F6c the window is the last 20 calls: 10 ok, 9 failed, 1 ok stay closed (9 of 20 = 45 %); a 10th failure pushes the first ok out and opens (10 of 20 = 50 %)', () => {
    const b = new Breaker();
    const out = feed(b, [...Array(10).fill(true), ...Array(9).fill(false), true, false]);

    expect(out.slice(0, 20)).toEqual(Array(20).fill(null));
    expect(out[20]).toBe('open'); // an all-time count would be 10 of 21 = 47.6 % and stay closed
  });

  it('REQ-PROJ-103 F6c open refuses calls without recording them, and halfOpen() starts a fresh probe count', () => {
    const b = new Breaker();
    openIt(b);

    expect(b.permits()).toBe(false);
    expect(feed(b, [true, true, true, true])).toEqual([null, null, null, null]); // ignored while open
    expect(b.state).toBe('open');
    expect(b.halfOpen()).toBe(true);
    expect(b.state).toBe('half-open');
    expect(b.halfOpen()).toBe(false);
    expect(b.permits()).toBe(true);
    // the 4 ignored calls were not probes: 3 recorded probes are still needed
    expect(feed(b, [false, true])).toEqual([null, null]);
    expect(b.state).toBe('half-open');
  });

  it('REQ-PROJ-103 F6c half-open with 3 probes, 1 failed (33 %) closes, and the decision waits for the 3rd probe', () => {
    for (const probes of [
      [true, true, false],
      [true, false, true],
      [false, true, true],
    ]) {
      const b = new Breaker();
      openIt(b);
      b.halfOpen();

      expect(feed(b, probes)).toEqual([null, null, 'closed']);
      expect(b.state).toBe('closed');
    }
  });

  it('REQ-PROJ-103 F6c half-open with 3 probes, 2 failed (67 %) or 3 failed opens again, only after the 3rd probe', () => {
    for (const probes of [
      [false, false, true],
      [false, true, false],
      [true, false, false],
      [false, false, false],
    ]) {
      const b = new Breaker();
      openIt(b);
      b.halfOpen();

      expect(feed(b, probes)).toEqual([null, null, 'open']);
      expect(b.state).toBe('open');
      expect(b.permits()).toBe(false);
      expect(b.halfOpen()).toBe(true); // it can recover again
    }
  });

  it('REQ-PROJ-103 F6c a close starts a new window: 9 failures after it do not open (minimum 10 calls)', () => {
    const b = new Breaker();
    openIt(b);
    b.halfOpen();
    feed(b, [true, true, true]);

    expect(b.state).toBe('closed');
    expect(feed(b, Array(9).fill(false))).toEqual(Array(9).fill(null));
    expect(b.record(false)).toBe('open');
  });

  it('REQ-PROJ-103 F6c a breaker that never opened never reports half-open or a close: closed stays closed', () => {
    const b = new Breaker();

    expect(feed(b, Array(100).fill(true))).toEqual(Array(100).fill(null));
    expect(b.state).toBe('closed');
  });
});
