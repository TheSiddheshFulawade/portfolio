import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { AppComponent } from '../../app.component';
import { appConfig } from '../../app.config';

// jsdom has no View Transitions API: stand in for it and record what the router asks for.
describe('route view transitions', () => {
  const doc = document as unknown as Record<string, unknown>;
  const skipTransition = vi.fn();
  const startViewTransition = vi.fn((update: () => Promise<void>) => {
    const done = Promise.resolve().then(update);
    return { updateCallbackDone: done, ready: done, finished: done, skipTransition };
  });

  function reduceMotion(matches: boolean) {
    vi.stubGlobal('matchMedia', () => ({ matches }) as MediaQueryList);
  }

  async function setup() {
    const { fixture } = await render(AppComponent, { providers: appConfig.providers });
    const router = TestBed.inject(Router);
    const go = async (url: string) => {
      await router.navigateByUrl(url);
      await fixture.whenStable();
    };
    await go('/');
    const initial = startViewTransition.mock.calls.length;
    vi.clearAllMocks();
    return { go, initial };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    doc['startViewTransition'] = startViewTransition;
    reduceMotion(false);
  });

  afterEach(() => {
    delete doc['startViewTransition'];
    vi.unstubAllGlobals();
  });

  // Runs first: the router feature keeps its "first navigation" flag in appConfig, which the tests share.
  it('REQ-MOT-103 a route change runs one view transition; the first load runs none', async () => {
    const { go, initial } = await setup();
    expect(initial).toBe(0);

    await go('/does-not-exist');

    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(skipTransition).not.toHaveBeenCalled();
  });

  it('REQ-UI-005 focus still moves to the main heading', async () => {
    const { go } = await setup();

    await go('/does-not-exist');

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent?.trim()).toBe('Page not found');
    expect(document.activeElement).toBe(heading);
  });

  it('REQ-MOT-102 reduced motion skips the transition', async () => {
    reduceMotion(true);
    const { go } = await setup();

    await go('/does-not-exist');

    expect(skipTransition).toHaveBeenCalledTimes(1);
  });

  it('REQ-MOT-103 a fragment change on the same page skips the transition', async () => {
    const { go } = await setup();

    await go('/#metrics-title');

    expect(skipTransition).toHaveBeenCalledTimes(1);
  });
});
