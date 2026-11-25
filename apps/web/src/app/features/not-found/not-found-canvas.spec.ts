import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { layoutDots } from '../../shared/canvas/dot-layout';
import { NotFoundPageComponent } from './not-found-page.component';

// Assumed markup: one <canvas> inside the page that draws the "404" dots with 2D arcs or rects, sized from its
// CSS box (clientWidth / clientHeight), aria-hidden="true" (the h1 and the link carry the meaning).
describe('NotFoundPageComponent dot field (REQ-UI-104)', () => {
  const W = 600;
  const H = 240;
  let shapes: number;
  let queue: FrameRequestCallback[];
  let rafCalls: number;

  function stubCanvas(width = W, height = H) {
    shapes = 0;
    const ctx = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === 'arc' || prop === 'ellipse' || prop === 'fillRect' || prop === 'rect') {
            return () => void shapes++;
          }
          return () => undefined;
        },
        set: () => true,
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(height);
  }

  function stubFrames() {
    queue = [];
    rafCalls = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCalls++;
      queue.push(cb);
      return rafCalls;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  }

  function reducedMotion(reduce: boolean) {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: reduce && q.includes('prefers-reduced-motion'),
      media: q,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
    }));
  }

  async function setup() {
    const view = await render(NotFoundPageComponent, { providers: [provideRouter([])] });
    await view.fixture.whenStable();
    return view;
  }

  beforeEach(() => {
    stubCanvas();
    stubFrames();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('REQ-UI-104 shows exactly one canvas, hidden from assistive technology and not focusable', async () => {
    reducedMotion(false);
    const { container } = await setup();

    const canvases = container.querySelectorAll('canvas');
    expect(canvases).toHaveLength(1);
    expect(canvases[0].getAttribute('aria-hidden')).toBe('true');
    expect(canvases[0].hasAttribute('role')).toBe(false);
    expect(canvases[0].hasAttribute('aria-label')).toBe(false);
    expect(canvases[0].getAttribute('tabindex')).toBeNull();
  });

  it('REQ-UI-104 keeps the plain message and a link home next to the canvas', async () => {
    reducedMotion(false);
    await setup();

    expect(screen.getByRole('heading', { level: 1 }).textContent?.trim()).toBe('Page not found');
    expect(screen.getByRole('link', { name: 'Go to the home page' }).getAttribute('href')).toBe(
      '/',
    );
  });

  it('REQ-MOT-102 with reduced motion the final "404" is drawn at once, before any frame, and no loop follows', async () => {
    reducedMotion(true);
    await setup();

    // Drawn without waiting for a frame (Angular itself may queue one frame for change detection).
    expect(shapes).toBe(layoutDots('404', W, H).length);
    const drawnAtOnce = shapes;
    for (let frame = 0; frame < 10 && queue.length; frame++) {
      queue.splice(0).forEach((cb) => cb(16 * (frame + 1)));
    }

    expect(queue).toHaveLength(0);
    expect(rafCalls).toBeLessThanOrEqual(2);
    expect(shapes).toBe(drawnAtOnce);
  });

  it('REQ-MOT-101 REQ-MOT-103 without input the field settles: the frame loop is empty after a few frames', async () => {
    reducedMotion(false);
    await setup();

    for (let frame = 0; frame < 30 && queue.length; frame++) {
      queue.splice(0).forEach((cb) => cb(16 * (frame + 1)));
    }

    expect(queue).toHaveLength(0);
    expect(shapes).toBeGreaterThanOrEqual(layoutDots('404', W, H).length);
  });

  it('REQ-UI-104 draws nothing when the canvas has no size (not laid out) instead of throwing', async () => {
    reducedMotion(true);
    vi.restoreAllMocks();
    stubCanvas(0, 0);

    await setup();

    expect(shapes).toBe(0);
  });

  it('REQ-UI-104 carries no financial claim and no style attribute', async () => {
    reducedMotion(false);
    const { container } = await setup();

    expect(container.textContent).not.toMatch(
      /payment|money|ledger|balance|settle|transfer|\$|£|€|₹|%/i,
    );
    expect(container.querySelectorAll('[style]')).toHaveLength(0);
  });
});
