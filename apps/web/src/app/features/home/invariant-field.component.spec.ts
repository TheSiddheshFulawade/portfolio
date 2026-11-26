import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { fireEvent, render, screen } from '@testing-library/angular';
import { homeContent } from '../../core/content/home-content';
import { HomePageComponent } from './home-page.component';
import { InvariantFieldComponent } from './invariant-field.component';

// Spec 005 RD-05 fixes: server render must not touch browser-only globals (REQ-HOME-103, REQ-MOT-103),
// the replay phase is announced (REQ-ACC-003, REQ-HOME-103), and focus stays on the run button (REQ-ACC-003).
// Assumed new content: homeContent.field.status.nodeReplay (finance R5-F4).
const REPLAY_TEXT =
  'The node is back and replays its durable log, in order. Nothing committed was lost.';

let rafQueue: { id: number; cb: FrameRequestCallback }[] = [];
let nextId = 0;

function stubBrowser() {
  const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(900);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(360);
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  rafQueue = [];
  nextId = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafQueue.push({ id: ++nextId, cb });
    return nextId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafQueue = rafQueue.filter((f) => f.id !== id);
  });
}

/** Runs queued animation frames on a clock of 16 ms steps. */
function frames(ms: number, each?: () => void): void {
  let t = 0;
  while (t < ms) {
    t += 16;
    const queued = rafQueue;
    rafQueue = [];
    for (const f of queued) f.cb(t);
    each?.();
  }
}

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('server render and destroy (REQ-HOME-103, REQ-MOT-103)', () => {
  function serverWithoutBrowserGlobals() {
    vi.stubGlobal('requestAnimationFrame', undefined);
    vi.stubGlobal('cancelAnimationFrame', undefined);
    vi.stubGlobal('matchMedia', undefined);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: PLATFORM_ID, useValue: 'server' }],
    });
  }

  it('REQ-HOME-103 creating and destroying the invariant field on the server throws nothing', () => {
    serverWithoutBrowserGlobals();

    const fixture = TestBed.createComponent(InvariantFieldComponent);
    fixture.detectChanges();

    expect(() => fixture.destroy()).not.toThrow();
  });

  it('REQ-HOME-103 creating and destroying the Home page on the server throws nothing', () => {
    serverWithoutBrowserGlobals();

    const fixture = TestBed.createComponent(HomePageComponent);
    fixture.detectChanges();

    expect(() => fixture.destroy()).not.toThrow();
  });
});

describe('invariant field in the browser', () => {
  it('REQ-MOT-103 destroying the field cancels its pending animation frame', async () => {
    stubBrowser();
    const { fixture } = await render(InvariantFieldComponent);
    const copy = homeContent.field;
    fireEvent.click(screen.getByRole('button', { name: copy.actions.node }));
    expect(rafQueue.length).toBeGreaterThan(0);
    const pending = rafQueue.map((f) => f.id);
    const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame');

    fixture.destroy();

    for (const id of pending) expect(cancel).toHaveBeenCalledWith(id);
    expect(rafQueue).toHaveLength(0);
  });

  it('REQ-ACC-003 REQ-HOME-103 the live status announces the replay phase with the content text', async () => {
    stubBrowser();
    await render(InvariantFieldComponent);
    const copy = homeContent.field;
    const status = () => norm(screen.getByRole('status').textContent);
    fireEvent.click(screen.getByRole('button', { name: copy.actions.node }));
    const seen = new Set<string>();

    frames(20_000, () => seen.add(status()));

    expect((copy.status as Record<string, string>)['nodeReplay']).toBe(REPLAY_TEXT);
    expect(seen.has(REPLAY_TEXT)).toBe(true);
    expect(status()).toBe(copy.status.nodeDone);
  });

  it('REQ-ACC-003 a run button keeps focus while busy, is aria-disabled not disabled, and ignores clicks', async () => {
    stubBrowser();
    await render(InvariantFieldComponent);
    const copy = homeContent.field;
    const node = screen.getByRole('button', { name: copy.actions.node });
    const partition = screen.getByRole('button', { name: copy.actions.partition });
    node.focus();

    fireEvent.click(node);

    expect(document.activeElement).toBe(node);
    for (const b of [node, partition]) {
      expect(b.getAttribute('aria-disabled')).toBe('true');
      expect(b.hasAttribute('disabled')).toBe(false);
    }
    const before = norm(screen.getByRole('status').textContent);
    expect(before).toBe(copy.status.node);
    fireEvent.click(partition);
    fireEvent.click(node);
    expect(norm(screen.getByRole('status').textContent)).toBe(before);

    frames(20_000);

    expect(document.activeElement).toBe(node);
    expect(node.getAttribute('aria-disabled')).not.toBe('true');
  });
});
