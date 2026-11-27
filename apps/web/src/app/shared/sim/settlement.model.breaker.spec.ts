import { SettlementSim } from './settlement.model';

// REQ-PROJ-103, REQ-RD-07: breaker and relay behaviour of the Settlement Lab model, against settlement-lab's
// OutboxPublisher.relayLoop (publishes through the breaker every 20 ms in any state except open) and the
// repository's measured runs (one breaker open per cell). 30 seeds per combination.

type Mode = 'ordered' | 'cas' | 'unordered' | 'unsynchronised';
type Fault = 'none' | 'flaky' | 'outage';
interface Ev {
  tick: number;
  code: string;
  source?: 'direct' | 'relay';
  attempt?: number;
}
interface Run {
  events: Ev[];
  end: string;
  opens: number;
  outboxDepth: number;
  breaker: string;
  startBreaker: string[]; // breaker state at the start of tick i+1 (end of tick i; index 0 is tick 1)
  outboxAtStart: number[];
  ticks: number;
}

const SEEDS = Array.from({ length: 30 }, (_, i) => 20_261_100 + i);
const OUTAGE_MODES: Mode[] = ['ordered', 'cas', 'unordered', 'unsynchronised'];
const MAX_STEPS = 60_000;
const T = 180_000;

const cache = new Map<string, Run>();
function run(mode: Mode, fault: Fault, seed: number): Run {
  const key = `${mode}/${fault}/${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const sim = new SettlementSim({ mode, fault, seed });
  const startBreaker: string[] = ['closed'];
  const outboxAtStart: number[] = [0];
  let n = 0;
  while (sim.snapshot.end === '' && n++ < MAX_STEPS) {
    sim.step();
    startBreaker.push(sim.snapshot.breaker);
    outboxAtStart.push(sim.snapshot.outboxDepth);
  }
  const s = sim.snapshot;
  const r: Run = {
    events: [...sim.events] as unknown as Ev[],
    end: s.end,
    opens: s.opens,
    outboxDepth: s.outboxDepth,
    breaker: s.breaker,
    startBreaker,
    outboxAtStart,
    ticks: s.tick,
  };
  cache.set(key, r);
  return r;
}

describe('REQ-PROJ-103 relay and breaker (OutboxPublisher.relayLoop)', () => {
  it(
    'REQ-PROJ-103 F1 a half-open breaker does not stop the relay: it publishes on every relay tick, with no probe-count gate',
    () => {
      const bad: string[] = [];
      let checked = 0;
      for (const mode of OUTAGE_MODES) {
        for (const seed of SEEDS) {
          const r = run(mode, 'outage', seed);
          for (let t = 1; t <= r.ticks; t++) {
            if (r.startBreaker[t - 1] !== 'half-open' || r.outboxAtStart[t - 1] === 0) continue;
            const inTick = r.events.filter((e) => e.tick === t);
            const waiting = r.events.some(
              (e) =>
                (e.tick === t - 1 || e.tick === t - 2) &&
                e.code === 'PUBLISH_FAILED' &&
                e.source === 'relay',
            );
            // a breaker that opened in this tick (a direct publish) refuses the relay: not a case for this rule
            if (waiting || inTick.some((e) => e.code === 'BREAKER_OPEN')) continue;
            checked++;
            const relayed = inTick.some(
              (e) =>
                (e.code === 'GL_ATTEMPT' || e.code === 'GL_NOT_PERMITTED') && e.source === 'relay',
            );
            if (!relayed) bad.push(`${mode}/${seed}@${t}`);
          }
        }
      }

      expect(checked).toBeGreaterThan(0);
      expect(bad).toEqual([]);
    },
    T,
  );

  it(
    'REQ-PROJ-103 F1 an open breaker refuses the relay: no relay call is made in a tick that starts open',
    () => {
      const bad: string[] = [];
      let openTicks = 0;
      for (const mode of OUTAGE_MODES) {
        for (const seed of SEEDS) {
          const r = run(mode, 'outage', seed);
          for (let t = 1; t <= r.ticks; t++) {
            if (r.startBreaker[t - 1] !== 'open') continue;
            openTicks++;
            if (
              r.events.some((e) => e.tick === t && e.code === 'GL_ATTEMPT' && e.source === 'relay')
            )
              bad.push(`${mode}/${seed}@${t}`);
          }
        }
      }

      expect(openTicks).toBeGreaterThan(0);
      expect(bad).toEqual([]);
    },
    T,
  );

  it(
    'REQ-PROJ-103 F2 with the 90 tick open wait every outage run finishes (60 of 60 ordered and cas, 120 of 120 with the unsafe modes) and the breaker opens once',
    () => {
      const notDone: string[] = [];
      const notOnce: string[] = [];
      for (const mode of OUTAGE_MODES) {
        for (const seed of SEEDS) {
          const r = run(mode, 'outage', seed);
          // unordered may end in a deadlock before any outage: that is a different end, not a breaker fault
          if (mode === 'unordered' && r.end === 'deadlock') continue;
          if (r.end !== 'done') notDone.push(`${mode}/${seed}:${r.end}`);
          if (r.opens !== 1) notOnce.push(`${mode}/${seed}:${r.opens}`);
          expect(r.events.filter((e) => e.code === 'BREAKER_OPEN').length).toBe(r.opens);
        }
      }

      expect(notDone).toEqual([]);
      expect(notOnce).toEqual([]);
    },
    T,
  );

  it(
    'REQ-PROJ-103 F2 ordered and cas under outage: 60 of 60 runs end done, one open each, and the breaker ends closed with an empty outbox',
    () => {
      const bad: string[] = [];
      for (const mode of ['ordered', 'cas'] as Mode[]) {
        for (const seed of SEEDS) {
          const r = run(mode, 'outage', seed);
          if (r.end !== 'done' || r.opens !== 1 || r.breaker !== 'closed' || r.outboxDepth !== 0)
            bad.push(
              `${mode}/${seed}:${r.end}/opens=${r.opens}/${r.breaker}/outbox=${r.outboxDepth}`,
            );
        }
      }

      expect(bad).toEqual([]);
    },
    T,
  );

  it(
    'REQ-PROJ-103 F6a the workload can end while the breaker is not closed or the outbox is not empty; the relay then closes the breaker and the outbox drains to zero',
    () => {
      // With the 90 tick open wait no seed of the default outage (ticks 40 to 110) reaches the end of the workload (about
      // tick 500 ordered, 1,000 cas) in that state, so the tail is built: `outage` places the fault window. It starts 20
      // ticks before the last settlement and runs 200 ticks past it, so the breaker is open or half-open and the outbox is
      // full when the last transfer settles. Only the relay can finish such a run.
      const bad: string[] = [];
      let tails = 0;
      for (const mode of ['ordered', 'cas'] as Mode[]) {
        for (const seed of SEEDS.slice(0, 10)) {
          const lastWork = Math.max(
            ...run(mode, 'none', seed)
              .events.filter((e) => e.code === 'POSTED' || e.code === 'REJECTED_FUNDS')
              .map((e) => e.tick),
          );
          // `outage` is a new optional constructor option { from, to } in ticks; the default stays { from: 40, to: 110 }
          const sim = new SettlementSim({
            mode,
            fault: 'outage',
            seed,
            outage: { from: lastWork - 20, to: lastWork + 200 },
          } as ConstructorParameters<typeof SettlementSim>[0]);
          const states: string[] = ['closed'];
          const outbox: number[] = [0];
          let n = 0;
          while (sim.snapshot.end === '' && n++ < MAX_STEPS) {
            sim.step();
            states.push(sim.snapshot.breaker);
            outbox.push(sim.snapshot.outboxDepth);
          }
          const s = sim.snapshot;
          const settledAt = Math.max(
            ...[...sim.events]
              .filter((e) => e.code === 'POSTED' || e.code === 'REJECTED_FUNDS')
              .map((e) => e.tick),
          );
          if (states[settledAt] !== 'closed' || outbox[settledAt] > 0) tails++;
          const closedAfter = (sim.events as unknown as Ev[]).some(
            (e) => e.code === 'BREAKER_CLOSED' && e.tick > settledAt,
          );
          if (
            s.end !== 'done' ||
            !closedAfter ||
            s.breaker !== 'closed' ||
            s.outboxDepth !== 0 ||
            s.tick <= settledAt
          )
            bad.push(
              `${mode}/${seed}:${s.end}/closedAfter=${closedAfter}/${s.breaker}/outbox=${s.outboxDepth}`,
            );
        }
      }

      expect(tails).toBe(20); // every constructed run really has the tail
      expect(bad).toEqual([]);
    },
    T,
  );

  it(
    'REQ-PROJ-103 F6b ordered locking never forms a wait-for cycle: no run ends in a deadlock and no cycle is ever reported',
    () => {
      const bad: string[] = [];
      for (const fault of ['none', 'flaky', 'outage'] as Fault[]) {
        for (const seed of SEEDS) {
          const sim = new SettlementSim({ mode: 'ordered', fault, seed });
          let n = 0;
          while (sim.snapshot.end === '' && n++ < MAX_STEPS) {
            sim.step();
            if (sim.snapshot.cycle.length > 0) bad.push(`${fault}/${seed}@${sim.snapshot.tick}`);
          }
          if (sim.snapshot.end === 'deadlock') bad.push(`${fault}/${seed}:deadlock`);
          if (sim.events.some((e) => e.code === 'DEADLOCK_DETECTED'))
            bad.push(`${fault}/${seed}:event`);
        }
      }

      expect(bad).toEqual([]);
    },
    T,
  );

  it(
    'REQ-PROJ-103 F6c the model events obey the Resilience4j rule call by call: at least 10 calls and a failure rate of 50 % or more open the breaker; in half-open 3 probes with at most 1 failure close it, 2 or more open it again',
    () => {
      // Resilience4j CircuitBreakerConfig: count-based sliding window 20, minimumNumberOfCalls 10, failureRateThreshold 50
      // (opens when the failure rate is >= 50 % once the minimum is reached); permittedNumberOfCallsInHalfOpenState 3,
      // after which the failure rate of those 3 probes is compared with the same threshold: 1/3 = 33 % < 50 % closes,
      // 2/3 = 67 % >= 50 % opens. https://resilience4j.readme.io/docs/circuitbreaker
      // Trace the model's own events (one outcome per publish, after the retries) through that rule, call by call.
      const failedRate = (calls: boolean[]) =>
        calls.filter((c) => !c).length * 100 >= 50 * calls.length;
      const seen = {
        open: 0,
        closeFromHalf: 0,
        reopenFromHalf: 0,
        fiveOfTen: 0,
        probesOneFailed: 0,
      };
      const bad: string[] = [];
      for (const mode of ['ordered', 'cas'] as Mode[]) {
        for (const seed of SEEDS) {
          const r = run(mode, 'outage', seed);
          let state: 'closed' | 'open' | 'half-open' = 'closed';
          let window: boolean[] = [];
          let probes: boolean[] = [];
          for (const [i, e] of r.events.entries()) {
            if (e.code === 'PUBLISH_OK' || e.code === 'PUBLISH_FAILED') {
              const ok = e.code === 'PUBLISH_OK';
              if (state === 'closed') {
                window.push(ok);
                if (window.length > 20) window.shift();
              } else if (state === 'half-open') probes.push(ok);
              else bad.push(`${mode}/${seed}#${i}: a call was recorded while open`);
            } else if (e.code === 'BREAKER_OPEN') {
              seen.open++;
              if (state === 'closed') {
                if (window.length < 10 || !failedRate(window))
                  bad.push(`${mode}/${seed}#${i}: opened below rule (${window.length} calls)`);
                if (window.length === 10 && window.filter((c) => !c).length === 5) seen.fiveOfTen++;
              } else if (state === 'half-open') {
                seen.reopenFromHalf++;
                if (probes.length !== 3 || probes.filter((c) => !c).length < 2)
                  bad.push(`${mode}/${seed}#${i}: reopened on ${probes.length} probes`);
              } else bad.push(`${mode}/${seed}#${i}: open from open`);
              state = 'open';
              window = [];
              probes = [];
            } else if (e.code === 'BREAKER_HALF_OPEN') {
              if (state !== 'open') bad.push(`${mode}/${seed}#${i}: half-open from ${state}`);
              state = 'half-open';
              probes = [];
            } else if (e.code === 'BREAKER_CLOSED') {
              if (
                state !== 'half-open' ||
                probes.length !== 3 ||
                probes.filter((c) => !c).length > 1
              )
                bad.push(`${mode}/${seed}#${i}: closed on ${probes.length} probes`);
              else if (probes.filter((c) => !c).length === 1) seen.probesOneFailed++;
              seen.closeFromHalf++;
              state = 'closed';
              window = [];
              probes = [];
            }
            // the rule held at every closed outcome: if it is met the breaker must have opened at this very event
            if (
              state === 'closed' &&
              (e.code === 'PUBLISH_OK' || e.code === 'PUBLISH_FAILED') &&
              window.length >= 10 &&
              failedRate(window)
            ) {
              const next = r.events[i + 1];
              if (!next || next.code !== 'BREAKER_OPEN')
                bad.push(
                  `${mode}/${seed}#${i}: rule met (${window.length} calls) but the breaker stayed closed`,
                );
            }
          }
        }
      }

      expect(bad).toEqual([]);
      expect(seen.open).toBeGreaterThan(0);
      expect(seen.closeFromHalf).toBeGreaterThan(0);
    },
    T,
  );
});
