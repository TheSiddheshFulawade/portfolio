/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fireEvent, render, screen, within } from '@testing-library/angular';
import { SettlementSim, checkInvariants } from '../../../shared/sim/settlement.model';
import { SettlementBoardComponent } from './settlement-board.component';

// REQ-PROJ-103, 105, REQ-ACC-003, 004, REQ-MOT-101 to 103, REQ-A11Y-101: the Settlement Lab view only draws the model.
//
// Contract the implementation must meet (features/projects/settlement-board/settlement-board.component.ts, selector
// sf-settlement-board, export SettlementBoardComponent, template in settlement-board.component.html):
//   - input `seed` (number, any default); the run is SettlementSim({ mode, fault, seed }) stepped on requestAnimationFrame
//     at one fixed rate for all modes, never on load, never on timers.
//   - a <select> labelled "Ledger mode" with option values ordered | cas | unordered | unsynchronised; the two unsafe options
//     are labelled with the word "unsafe" and "browser only"; a <select> labelled "Fault" with values none | flaky | outage.
//   - a button named "Run" (aria-disabled, not disabled, while a run is playing).
//   - role="log" named "Step log" with the model's events as text lines (breaker transition lines are always kept).
//   - a list named "Invariants" with six items, each holding the invariant's code name and one of "pass", "fail" or
//     "not evaluated" (text, not colour). Before the first Run none of those three words appears in it.
//   - static copy (also before Run): the label "simplified model" and sentences S1 to S6 of .cache/accuracy/rd07-model-technical.md.
//   - with prefers-reduced-motion: reduce, Run shows the final state at once, with the same text and numbers.
//   - an unordered run that finishes shows exactly "No deadlock this time; the risk remains."
//   - the loop stops when the document is hidden, when the board is off screen (IntersectionObserver) and when settled.

const S1 =
  "A simplified model of settlement-lab at e3c1b91 (SPEC.md sections 4.3 to 4.5). Accounts, transfers, queue size and waits are scaled down; retry and circuit-breaker limits and the six invariants are the repository's.";
const S2 =
  "Unsynchronised mode removes only the ledger's locking. The idempotency store still claims each id before the queue, so no transfer posts twice; updates are lost instead, and funds are checked against balances that may be stale. This mode and unordered locking exist only in this browser model, not in the repository.";
const S3 =
  'When the queue is full, a client here waits for room. The engine would wait 100 ms, answer QUEUE_FULL and free the id; in the measured runs, 64 closed-loop clients cannot fill its queue of 1,024.';
const S4 =
  'Here the three attempts run within one tick. The repository waits between them: about 50 ms, then about 100 ms, each spread by up to 50 % jitter.';
const S5 =
  "The workload is smaller and tighter: 40 accounts, 45 % of transfers among 12 hot accounts, opening balances of 250, amounts of 1 to 100 and about 5 % resends. About 10 % of transfers are rejected for funds here; the repository's measured runs reject about 0.8 %.";
const S6 =
  'Worker timing is invented: a lock takes one tick and the work 1 to 3 ticks. Ticks are model time, not a measurement, and say nothing about measured throughput.';
const NO_DEADLOCK = 'No deadlock this time; the risk remains.';
const NAMES = [
  'TOTAL_CONSERVED',
  'NO_NEGATIVE_BALANCE',
  'POSTED_AT_MOST_ONCE',
  'POSTINGS_EXPLAIN_BALANCES',
  'POSTINGS_MATCH_ACCEPTED',
  'GL_MATCHES_POSTINGS',
] as const;
const SEED = 20_261_100;

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

let rafQueue: { id: number; cb: FrameRequestCallback }[] = [];
let nextId = 0;
let reduced = false;
let observers: IntersectionObserverCallback[] = [];

function stubBrowser(options: { reduced?: boolean; intersection?: boolean } = {}) {
  reduced = options.reduced ?? false;
  const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: reduced && q.includes('reduce'),
    media: q,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  rafQueue = [];
  nextId = 0;
  observers = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafQueue.push({ id: ++nextId, cb });
    return nextId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafQueue = rafQueue.filter((f) => f.id !== id);
  });
  if (options.intersection) {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: IntersectionObserverCallback) {
          observers.push(cb);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  }
}

/** Runs queued frames (16 ms apart) until none is queued or `max` frames ran; `each` runs after every frame. */
function frames(max: number, each?: () => void): number {
  let n = 0;
  while (rafQueue.length > 0 && n < max) {
    n++;
    const queued = rafQueue;
    rafQueue = [];
    for (const f of queued) f.cb(n * 16);
    each?.();
  }
  return n;
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
  Object.defineProperty(document, 'visibilityState', {
    value: hidden ? 'hidden' : 'visible',
    configurable: true,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

async function board(mode: string, fault: string, seed = SEED) {
  const view = await render(SettlementBoardComponent, { inputs: { seed } });
  fireEvent.change(screen.getByLabelText('Ledger mode'), { target: { value: mode } });
  fireEvent.change(screen.getByLabelText('Fault'), { target: { value: fault } });
  return view;
}
const text = () => norm(document.body.textContent);
const log = () => screen.getByRole('log', { name: 'Step log' });
const invariantItems = () =>
  within(screen.getByRole('list', { name: 'Invariants' })).getAllByRole('listitem');
const run = () => fireEvent.click(screen.getByRole('button', { name: 'Run' }));

/** First seed (of up to 600) where the unordered model ends as asked: found with the model, not hard-coded. */
function unorderedSeed(end: 'deadlock' | 'done'): number {
  for (let seed = SEED; seed < SEED + 600; seed++) {
    const sim = new SettlementSim({ mode: 'unordered', fault: 'none', seed });
    let n = 0;
    while (sim.snapshot.end === '' && n++ < 60_000) sim.step();
    if (sim.snapshot.end === end) return seed;
  }
  throw new Error(`no unordered seed ends ${end}`);
}

afterEach(() => {
  setHidden(false);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('REQ-PROJ-105 start, controls and end', () => {
  it('REQ-PROJ-105 REQ-MOT-101 nothing runs on load: no frame is requested and no invariant has a result', async () => {
    stubBrowser();
    await render(SettlementBoardComponent, { inputs: { seed: SEED } });

    expect(rafQueue).toHaveLength(0);
    expect(log().textContent?.trim() ?? '').toBe('');
    for (const li of invariantItems()) expect(norm(li.textContent)).not.toMatch(/pass|fail|not evaluated/i);
  });

  it('REQ-PROJ-103 REQ-PROJ-105 the mode selector offers ordered, CAS and the two modes marked unsafe and browser only', async () => {
    stubBrowser();
    await render(SettlementBoardComponent, { inputs: { seed: SEED } });
    const select = screen.getByLabelText('Ledger mode') as HTMLSelectElement;
    const options = [...select.options].map((o) => ({ value: o.value, label: norm(o.textContent) }));

    expect(options.map((o) => o.value)).toEqual(['ordered', 'cas', 'unordered', 'unsynchronised']);
    for (const o of options.slice(2)) expect(o.label).toMatch(/unsafe/i);
    for (const o of options.slice(2)) expect(o.label).toMatch(/browser only/i);
    for (const o of options.slice(0, 2)) expect(o.label).not.toMatch(/unsafe/i);
  });

  it('REQ-PROJ-103 the fault selector offers none, flaky and outage', async () => {
    stubBrowser();
    await render(SettlementBoardComponent, { inputs: { seed: SEED } });
    const select = screen.getByLabelText('Fault') as HTMLSelectElement;

    expect([...select.options].map((o) => o.value)).toEqual(['none', 'flaky', 'outage']);
  });

  it('REQ-PROJ-105 REQ-MOT-103 a click on Run starts it, it ends by itself and then queues no more frames', async () => {
    stubBrowser();
    await board('ordered', 'flaky');
    run();

    expect(rafQueue.length).toBeGreaterThan(0);
    const ran = frames(20_000);

    expect(ran).toBeGreaterThan(1);
    expect(rafQueue).toHaveLength(0);
    for (const li of invariantItems()) expect(norm(li.textContent)).toMatch(/pass|fail/i);
  });

  it('REQ-A11Y-101 REQ-PROJ-105 the step log is text in a log role and grows while it runs', async () => {
    stubBrowser();
    await board('ordered', 'none');
    run();
    frames(3);
    const early = norm(log().textContent).length;
    frames(20_000);

    expect(early).toBeGreaterThan(0);
    expect(norm(log().textContent).length).toBeGreaterThan(early);
    expect(log().getAttribute('role')).toBe('log');
  });

  it('REQ-MOT-103 the loop stops while the document is hidden and goes on when it is visible again', async () => {
    stubBrowser();
    await board('ordered', 'none');
    run();
    frames(2);
    setHidden(true);
    frames(2); // the frame already queued may run once

    expect(rafQueue).toHaveLength(0);
    expect(invariantItems().some((li) => /pass|fail/i.test(li.textContent ?? ''))).toBe(false);

    setHidden(false);
    expect(rafQueue.length).toBeGreaterThan(0);
    frames(20_000);

    expect(invariantItems().every((li) => /pass|fail/i.test(li.textContent ?? ''))).toBe(true);
  });

  it('REQ-MOT-103 the loop stops while the board is off screen', async () => {
    stubBrowser({ intersection: true });
    await board('ordered', 'none');
    run();
    frames(2);
    for (const cb of observers)
      cb([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
    frames(2);

    expect(rafQueue).toHaveLength(0);
    for (const cb of observers)
      cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(rafQueue.length).toBeGreaterThan(0);
  });

  it('REQ-ACC-003 creating and destroying the board on the server throws nothing and touches no browser global', () => {
    vi.stubGlobal('requestAnimationFrame', undefined);
    vi.stubGlobal('cancelAnimationFrame', undefined);
    vi.stubGlobal('matchMedia', undefined);
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'server' }] });

    const fixture = TestBed.createComponent(SettlementBoardComponent);
    fixture.detectChanges();

    expect(() => fixture.destroy()).not.toThrow();
  });
});

describe('REQ-PROJ-103 REQ-A11Y-101 invariants and the end state, drawn from the model', () => {
  it('REQ-ACC-003 the six invariants are listed with pass or fail in text and equal checkInvariants of the model run', async () => {
    for (const mode of ['ordered', 'unsynchronised']) {
      stubBrowser();
      const view = await board(mode, 'flaky');
      run();
      frames(20_000);
      const sim = new SettlementSim({ mode: mode as 'ordered', fault: 'flaky', seed: SEED });
      let n = 0;
      while (sim.snapshot.end === '' && n++ < 60_000) sim.step();
      const expected = checkInvariants(sim.runRecord) as Record<string, boolean>;
      const items = invariantItems();

      expect(items).toHaveLength(6);
      for (const name of NAMES) {
        const li = items.find((i) => norm(i.textContent).includes(name));
        expect(li, `${mode}: ${name} listed`).toBeDefined();
        expect(norm(li?.textContent)).toMatch(expected[name] ? /pass/i : /fail/i);
        expect(norm(li?.textContent)).not.toMatch(expected[name] ? /fail/i : /pass/i);
      }
      view.fixture.destroy();
      view.container.remove();
    }
  });

  it('REQ-PROJ-103 a deadlocked unordered run shows "not evaluated" for all six invariants and ends by itself', async () => {
    stubBrowser();
    await board('unordered', 'none', unorderedSeed('deadlock'));
    run();
    frames(20_000);

    expect(rafQueue).toHaveLength(0);
    const items = invariantItems();
    expect(items).toHaveLength(6);
    for (const li of items) {
      expect(norm(li.textContent)).toMatch(/not evaluated/i);
      expect(norm(li.textContent)).not.toMatch(/\bpass\b|\bfail\b/i);
    }
    expect(text()).not.toContain(NO_DEADLOCK);
  });

  it('REQ-PROJ-103 an unordered run that finishes says exactly "No deadlock this time; the risk remains."', async () => {
    stubBrowser();
    await board('unordered', 'none', unorderedSeed('done'));
    run();
    frames(40_000);

    expect(text()).toContain(NO_DEADLOCK);
    for (const li of invariantItems()) expect(norm(li.textContent)).toMatch(/pass|fail/i);
  });

  it('REQ-PROJ-103 the finished-run sentence never appears for ordered locking', async () => {
    stubBrowser();
    await board('ordered', 'none');
    run();
    frames(20_000);

    expect(text()).not.toContain(NO_DEADLOCK);
    expect(text()).not.toMatch(/No deadlock this time/i);
  });

  it('REQ-ACC-004 REQ-PROJ-103 the half-open line of the log says the relay calls next, never that the breaker switches by itself', async () => {
    stubBrowser();
    await board('ordered', 'outage');
    run();
    const lines = new Set<string>();
    frames(30_000, () => {
      for (const li of log().children) lines.add(norm(li.textContent));
    });
    const half = [...lines].filter((l) => /half-open/i.test(l));

    expect(half.length).toBeGreaterThan(0);
    for (const l of half) {
      expect(l).toMatch(/next call/i);
      expect(l).not.toMatch(/on its own|by itself|automatically|switches/i);
    }
  });
});

describe('REQ-ACC-004 REQ-MOT-102 labels, copy and reduced motion', () => {
  it('REQ-ACC-004 the board is labelled "simplified model" and carries S1, S2, S3, S4, S5 and S6 verbatim, before any run', async () => {
    stubBrowser();
    await render(SettlementBoardComponent, { inputs: { seed: SEED } });

    expect(text()).toMatch(/simplified model/i);
    for (const s of [S1, S2, S3, S4, S5, S6]) expect(text()).toContain(s);
  });

  it('REQ-ACC-004 the model tick is never set beside the measured 2.9x to 4.6x', async () => {
    stubBrowser();
    await render(SettlementBoardComponent, { inputs: { seed: SEED } });

    expect(text()).not.toMatch(/2\.9\s*x|4\.6\s*x|2\.9\s*to\s*4\.6/i);
  });

  it('REQ-MOT-102 with reduced motion Run shows the final state at once, with the same text and numbers as the animated run', async () => {
    stubBrowser();
    const first = await board('cas', 'outage');
    run();
    frames(40_000);
    const animated = text();
    first.fixture.destroy();
    first.container.remove();

    stubBrowser({ reduced: true });
    await board('cas', 'outage');
    run();
    const instant = text();

    expect(rafQueue).toHaveLength(0);
    expect(instant).toBe(animated);
    for (const li of invariantItems()) expect(norm(li.textContent)).toMatch(/pass|fail/i);
  });

  it('REQ-MOT-102 with reduced motion a deadlocked run also shows its final state at once', async () => {
    stubBrowser({ reduced: true });
    await board('unordered', 'none', unorderedSeed('deadlock'));
    run();

    expect(rafQueue).toHaveLength(0);
    for (const li of invariantItems()) expect(norm(li.textContent)).toMatch(/not evaluated/i);
  });
});

describe('REQ-SEC CSP: no inline styles', () => {
  it('REQ-ACC-003 the template has no style attribute, [style] or [ngStyle] binding', () => {
    const html = readFileSync(
      `${process.cwd()}/src/app/features/projects/settlement-board/settlement-board.component.html`,
      'utf8',
    );

    expect(html).not.toMatch(/\sstyle\s*=/i);
    expect(html).not.toMatch(/\[(attr\.)?style[\].]/i);
    expect(html).not.toMatch(/ngStyle/);
  });

  it('REQ-ACC-003 after a run the rendered board has no element with a style attribute', async () => {
    stubBrowser();
    const { container } = await board('ordered', 'flaky');
    run();
    frames(20_000);

    expect(container.querySelectorAll('[style]')).toHaveLength(0);
  });
});
