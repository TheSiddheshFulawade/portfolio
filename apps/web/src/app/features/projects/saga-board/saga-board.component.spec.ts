/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fireEvent, render, screen } from '@testing-library/angular';
import { sagaContent } from '../../../core/content/saga-content';
import { SagaSim, SCENARIO_LABELS, type Scenario } from '../../../shared/sim/saga.model';
import { SagaBoardComponent } from './saga-board.component';

// REQ-PROJ-102, 105, REQ-ACC-003, 004, 005, REQ-MOT-101 to 103, REQ-A11Y-101, REQ-SEC-101: the PayFlow view only draws the
// model (shared/sim/saga.model.ts).
//
// Contract (features/projects/saga-board/saga-board.component.ts, selector sf-saga-board, export SagaBoardComponent,
// template saga-board.component.html, styles saga-board.component.scss; root element class "saga-board"):
//   - input `seed` (number); the run is new SagaSim(scenario, seed), one model step per playback tick, driven by
//     requestAnimationFrame, never on load, never on timers.
//   - static copy comes from content/saga.yaml through core/content/saga-content.ts (`sagaContent`, imported only by the
//     board): sagaContent.board = { heading, label ("Simplified model"), lead, notes: string[] (rendered verbatim; they
//     name payflow 167d172 and say PF-07 to PF-12 are "specified, not built yet"), reversed: string (the REVERSED
//     explanation: an authorisation reversal, any hold released, nothing captured) }.
//   - <select> labelled "Scenario" with the six model scenarios as values; each option text contains that scenario's
//     SCENARIO_LABELS label. The label of the chosen scenario is also shown as visible text outside the select.
//   - buttons: "Run" (starts), "Pause" (while playing; the same button then reads "Resume"), real <button> elements.
//   - role="log" named "Event log": one child per model event, in order; a line holds the message id and type when the
//     event has them, as text.
//   - data-testid: payment-state (state name), inbox-payment|wallet|risk and outbox-payment|wallet|risk (counts),
//     payer-available, payer-held, payee-available, payee-held, sigma (sum of available + held). Numbers are integers in
//     international format ("1,000"); tests strip commas. A new board shows state NONE and zero counts.
//   - REVERSED is explained wherever the text REVERSED appears (static copy included). The words refund and rollback never appear.
//   - reduced motion: Run shows the final state at once, same text as the animated run.
//   - the loop stops when the document is hidden, when the board is off screen and when the run is settled (done).

const SEED = 20_261_127;
const SCENARIOS: Scenario[] = [
  'completes',
  'wallet-crash',
  'duplicate-delivery',
  'risk-rejection',
  'broker-outage',
  'insufficient-funds',
];
const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

let rafQueue: { id: number; cb: FrameRequestCallback }[] = [];
let nextId = 0;
let observers: IntersectionObserverCallback[] = [];

function stubBrowser(options: { reduced?: boolean; intersection?: boolean } = {}) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: !!options.reduced && q.includes('reduce'),
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
        observe() {
          // stub: the test drives the callback
        }
        unobserve() {
          // stub: the test drives the callback
        }
        disconnect() {
          // stub: the test drives the callback
        }
      },
    );
  }
}

function frames(max: number): number {
  let n = 0;
  while (rafQueue.length > 0 && n < max) {
    n++;
    const queued = rafQueue;
    rafQueue = [];
    for (const f of queued) f.cb(n * 16);
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

async function board(scenario: Scenario, seed = SEED) {
  TestBed.resetTestingModule();
  const view = await render(SagaBoardComponent, { inputs: { seed } });
  fireEvent.change(screen.getByLabelText('Scenario'), { target: { value: scenario } });
  return view;
}
const text = () => norm(document.body.textContent);
const log = () => screen.getByRole('log', { name: 'Event log' });
const run = () => fireEvent.click(screen.getByRole('button', { name: 'Run' }));
const id = (t: string) => norm(screen.getByTestId(t).textContent);
const num = (t: string) => Number(id(t).replace(/,/g, ''));
const finalModel = (scenario: Scenario, seed = SEED) => {
  const sim = new SagaSim(scenario, seed);
  let n = 0;
  while (!sim.done && n++ < 1_000) sim.step();
  return sim;
};
function readView() {
  return {
    state: id('payment-state'),
    inbox: ['payment', 'wallet', 'risk'].map((s) => num(`inbox-${s}`)),
    outbox: ['payment', 'wallet', 'risk'].map((s) => num(`outbox-${s}`)),
    money: ['payer-available', 'payer-held', 'payee-available', 'payee-held'].map(num),
    sigma: num('sigma'),
  };
}
function expectedView(scenario: Scenario) {
  const s = finalModel(scenario).snapshot;
  const money = [
    s.wallets.payer.available,
    s.wallets.payer.held,
    s.wallets.payee.available,
    s.wallets.payee.held,
  ];
  return {
    state: s.state,
    inbox: [s.inbox.payment, s.inbox.wallet, s.inbox.risk],
    outbox: [s.outbox.payment, s.outbox.wallet, s.outbox.risk],
    money,
    sigma: money.reduce((a, b) => a + b, 0),
  };
}

afterEach(() => {
  setHidden(false);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('REQ-PROJ-105 start, pause and end', () => {
  it('REQ-PROJ-105 REQ-MOT-101 nothing runs on load: no frame, empty log, state NONE, zero counts', async () => {
    stubBrowser();
    await render(SagaBoardComponent, { inputs: { seed: SEED } });

    expect(rafQueue).toHaveLength(0);
    expect(log().children).toHaveLength(0);
    expect(id('payment-state')).toBe('NONE');
    for (const s of ['payment', 'wallet', 'risk']) {
      expect(num(`inbox-${s}`)).toBe(0);
      expect(num(`outbox-${s}`)).toBe(0);
    }
  });

  it('REQ-PROJ-105 changing the scenario does not start a run', async () => {
    stubBrowser();
    await board('risk-rejection');

    expect(rafQueue).toHaveLength(0);
    expect(log().children).toHaveLength(0);
  });

  it('REQ-PROJ-105 REQ-MOT-103 a click on Run starts it, it ends by itself and then queues no more frames', async () => {
    stubBrowser();
    await board('completes');
    run();

    expect(rafQueue.length).toBeGreaterThan(0);
    expect(frames(20_000)).toBeGreaterThan(1);
    expect(rafQueue).toHaveLength(0);
    expect(id('payment-state')).toBe('COMPLETED');
  });

  it('REQ-PROJ-105 Pause freezes the run and Resume carries on to the same end as an uninterrupted run', async () => {
    stubBrowser();
    await board('wallet-crash');
    run();
    frames(3);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    frames(2); // the frame already queued may run once
    const frozen = norm(log().textContent);

    expect(rafQueue).toHaveLength(0);
    frames(5);
    expect(norm(log().textContent)).toBe(frozen);

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(rafQueue.length).toBeGreaterThan(0);
    frames(20_000);

    expect(readView()).toEqual(expectedView('wallet-crash'));
  });

  it('REQ-MOT-103 the loop stops while the document is hidden and goes on when it is visible again', async () => {
    stubBrowser();
    await board('completes');
    run();
    frames(2);
    setHidden(true);
    frames(2);

    expect(rafQueue).toHaveLength(0);
    expect(id('payment-state')).not.toBe('COMPLETED');

    setHidden(false);
    expect(rafQueue.length).toBeGreaterThan(0);
    frames(20_000);
    expect(id('payment-state')).toBe('COMPLETED');
  });

  it('REQ-MOT-103 the loop stops while the board is off screen and goes on when it is back', async () => {
    stubBrowser({ intersection: true });
    await board('completes');
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

  it('REQ-A11Y-101 Run, Pause and the scenario selector are native controls reachable by keyboard', async () => {
    stubBrowser();
    const { container } = await board('completes');

    expect(screen.getByLabelText('Scenario').tagName).toBe('SELECT');
    expect(screen.getByRole('button', { name: 'Run' }).tagName).toBe('BUTTON');
    for (const el of container.querySelectorAll('[tabindex]'))
      expect(Number(el.getAttribute('tabindex'))).toBeLessThanOrEqual(0);
    run();
    expect(screen.getByRole('button', { name: 'Pause' }).tagName).toBe('BUTTON');
  });

  it('REQ-ACC-003 creating and destroying the board on the server throws nothing and touches no browser global', () => {
    vi.stubGlobal('requestAnimationFrame', undefined);
    vi.stubGlobal('cancelAnimationFrame', undefined);
    vi.stubGlobal('matchMedia', undefined);
    vi.stubGlobal('IntersectionObserver', undefined);
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'server' }] });

    const fixture = TestBed.createComponent(SagaBoardComponent);
    fixture.detectChanges();

    expect(() => fixture.destroy()).not.toThrow();
  });
});

describe('REQ-PROJ-102 REQ-ACC-003 the view draws the model', () => {
  it.each(SCENARIOS)(
    'REQ-ACC-003 %s: the final state, counts, balances and sum equal the model run',
    async (scenario) => {
      stubBrowser();
      await board(scenario);
      run();
      frames(20_000);

      expect(readView()).toEqual(expectedView(scenario));
      expect(num('sigma')).toBe(1_000);
    },
  );

  it.each(SCENARIOS)(
    'REQ-A11Y-101 %s: the event log is text, one line per model event in order, with message ids and types',
    async (scenario) => {
      stubBrowser();
      await board(scenario);
      run();
      frames(20_000);
      const events = finalModel(scenario).events;
      const lines = [...log().children].map((l) => norm(l.textContent));

      expect(lines).toHaveLength(events.length);
      events.forEach((e, i) => {
        if (e.messageId) expect(lines[i]).toContain(e.messageId);
        if (e.type) expect(lines[i]).toContain(e.type);
      });
    },
  );

  it('REQ-ACC-003 REQ-PROJ-102 the sum is shown during the run and equals 1,000 after every frame', async () => {
    stubBrowser();
    await board('risk-rejection');
    run();
    let n = 0;
    while (rafQueue.length > 0 && n++ < 20_000) {
      frames(1);
      const parts =
        num('payer-available') + num('payer-held') + num('payee-available') + num('payee-held');
      expect(num('sigma')).toBe(parts);
      expect(num('sigma')).toBe(1_000);
    }
    expect(n).toBeGreaterThan(5);
  });

  it('REQ-PROJ-102 trap 1: the log shows the sweeper re-send under a new message id', async () => {
    stubBrowser();
    await board('wallet-crash');
    run();
    frames(20_000);
    const events = finalModel('wallet-crash').events;
    const resent = events.find((e) => e.code === 'COMMAND_RESENT')!;
    const first = events.find((e) => e.code === 'RELAY_PUBLISHED' && e.type === resent.type)!;
    const lines = [...log().children].map((l) => norm(l.textContent));

    expect(resent.messageId).not.toBe(first.messageId);
    expect(lines.some((l) => l.includes(resent.messageId!))).toBe(true);
    expect(lines.some((l) => l.includes(first.messageId!))).toBe(true);
  });

  it('REQ-ACC-003 a different seed changes the message ids shown, not the outcome', async () => {
    stubBrowser();
    await board('completes', SEED + 1);
    run();
    frames(20_000);
    const other = finalModel('completes', SEED + 1).events.find((e) => e.messageId)!.messageId!;
    const same = finalModel('completes').events.find((e) => e.messageId)!.messageId!;

    expect(id('payment-state')).toBe('COMPLETED');
    expect(norm(log().textContent)).toContain(other);
    expect(norm(log().textContent)).not.toContain(same);
  });
});

describe('REQ-ACC-004 REQ-ACC-005 labels and copy', () => {
  it('REQ-ACC-004 the board is labelled "simplified model" and renders the heading and every note from content, before any run', async () => {
    stubBrowser();
    await render(SagaBoardComponent, { inputs: { seed: SEED } });

    expect(sagaContent.board.notes.length).toBeGreaterThan(0);
    expect(text()).toMatch(/simplified model/i);
    expect(text()).toContain(norm(sagaContent.board.heading));
    for (const n of sagaContent.board.notes) expect(text()).toContain(norm(n));
  });

  it('REQ-ACC-005 the notes name payflow 167d172 and say PF-07 to PF-12 are specified, not built yet', () => {
    const notes = sagaContent.board.notes.join(' ');

    expect(notes).toContain('167d172');
    expect(notes).not.toContain('8566bf4');
    expect(notes).toMatch(/PF-07/);
    expect(notes).toMatch(/PF-12/);
    expect(notes).toMatch(/specified, not built yet/);
    expect(notes).not.toMatch(/production[- ]ready|fully tested|end-to-end tested/i);
  });

  it('REQ-ACC-005 every scenario option carries its label in text', async () => {
    stubBrowser();
    await render(SagaBoardComponent, { inputs: { seed: SEED } });
    const select = screen.getByLabelText('Scenario') as HTMLSelectElement;

    expect([...select.options].map((o) => o.value)).toEqual(SCENARIOS);
    for (const o of select.options)
      expect(norm(o.textContent)).toContain(SCENARIO_LABELS[o.value as Scenario]);
  });

  it.each(SCENARIOS)(
    'REQ-ACC-005 %s: the chosen scenario shows its label as text outside the select',
    async (scenario) => {
      stubBrowser();
      const { container } = await board(scenario);
      const outside = [...container.querySelectorAll('*')]
        .filter((el) => !el.closest('select') && el.querySelector('select') === null)
        .map((el) => norm(el.textContent));

      expect(outside.some((t) => t.includes(SCENARIO_LABELS[scenario]))).toBe(true);
    },
  );

  it('REQ-ACC-004 REQ-PROJ-102 trap 4: REVERSED is explained as an authorisation reversal, whenever it is on screen', async () => {
    const reversed = norm(sagaContent.board.reversed);
    expect(reversed).toMatch(/authori[sz]ation reversal/i);
    expect(reversed).toMatch(/releas/i);
    expect(reversed).toMatch(/nothing (was )?captured|not captured/i);

    for (const phase of ['idle', 'running', 'done'] as const) {
      stubBrowser();
      await board('risk-rejection');
      if (phase !== 'idle') run();
      if (phase === 'running') frames(3);
      if (phase === 'done') frames(20_000);

      if (text().includes('REVERSED')) expect(text()).toContain(reversed);
      if (phase === 'done') {
        expect(id('payment-state')).toBe('REVERSED');
        expect(text()).toContain(reversed);
      }
    }
  });

  it('REQ-ACC-004 the REVERSED explanation shows for an animated and a reduced-motion run alike, and refund, rollback and chargeback never appear', async () => {
    for (const reduced of [false, true]) {
      stubBrowser({ reduced });
      await board('risk-rejection');
      run();
      frames(20_000);

      expect(text()).toContain(norm(sagaContent.board.reversed));
      expect(text()).not.toMatch(/refund|roll(ed)?[- ]?back|chargeback/i);
    }
  });

  it('REQ-ACC-004 the copy is content, not hard-coded in the template or the component', () => {
    const dir = `${process.cwd()}/src/app/features/projects/saga-board/`;
    const html = readFileSync(`${dir}saga-board.component.html`, 'utf8');
    const ts = readFileSync(`${dir}saga-board.component.ts`, 'utf8');

    expect(html + ts).not.toMatch(
      /authori[sz]ation reversal|simplified model|167d172|not built yet/i,
    );
  });

  it('REQ-ACC-005 a terminal state is text, never colour alone', async () => {
    stubBrowser();
    await board('insufficient-funds');
    run();
    frames(20_000);

    expect(id('payment-state')).toBe('REJECTED');
    expect(text()).toContain('REJECTED');
  });
});

describe('REQ-MOT-102 reduced motion', () => {
  it.each(SCENARIOS)(
    'REQ-MOT-102 %s: Run shows the final state at once, with the same text as the animated run',
    async (scenario) => {
      stubBrowser();
      const first = await board(scenario);
      run();
      frames(20_000);
      const animated = text();
      first.fixture.destroy();
      first.container.remove();

      stubBrowser({ reduced: true });
      await board(scenario);
      run();

      expect(rafQueue).toHaveLength(0);
      expect(text()).toBe(animated);
      expect(readView()).toEqual(expectedView(scenario));
    },
  );
});

describe('REQ-SEC-101 CSP: no inline styles, no global class clash', () => {
  const dir = `${process.cwd()}/src/app/features/projects/saga-board/`;

  it('REQ-SEC-101 the template has no style attribute, [style] or [ngStyle] binding', () => {
    const html = readFileSync(`${dir}saga-board.component.html`, 'utf8');

    expect(html).not.toMatch(/\sstyle\s*=/i);
    expect(html).not.toMatch(/\[(attr\.)?style[\].]/i);
    expect(html).not.toMatch(/ngStyle/);
  });

  it('REQ-SEC-101 after a run the rendered board has no element with a style attribute', async () => {
    stubBrowser();
    const { container } = await board('broker-outage');
    run();
    frames(20_000);

    expect(container.querySelectorAll('[style]')).toHaveLength(0);
    expect(container.querySelector('.saga-board')).not.toBeNull();
  });

  it('REQ-SEC-101 REQ-UI-103 the styles keep emulated encapsulation and define no bare .field class (it clashed with base.css)', () => {
    const scss = readFileSync(`${dir}saga-board.component.scss`, 'utf8');
    const ts = readFileSync(`${dir}saga-board.component.ts`, 'utf8');
    const html = readFileSync(`${dir}saga-board.component.html`, 'utf8');

    expect(ts).not.toMatch(/ViewEncapsulation\.(None|ShadowDom)/);
    expect(scss).not.toMatch(/(^|[\s,{}])\.field\b/m);
    expect(html).not.toMatch(/class="[^"]*\bfield\b/);
  });

  it('REQ-PERF-101 the board reads its copy only through the content loader, not by fetching', () => {
    const ts = readFileSync(`${dir}saga-board.component.ts`, 'utf8');

    expect(ts).toMatch(/core\/content\/saga-content/);
    expect(ts).not.toMatch(/\bfetch\(|HttpClient/);
  });
});
