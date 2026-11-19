import { render, screen, waitFor } from '@testing-library/angular';
import { VisitorCounterComponent } from './visitor-counter.component';

function stubFetch(impl: () => Promise<Response>) {
  const fetch = vi.fn(impl);
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('VisitorCounterComponent', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('REQ-COUNT-001 counts this visit once and shows both numbers in international format', async () => {
    const fetch = stubFetch(async () => Response.json({ total: 4218, today: 37 }));

    const { container } = await render(VisitorCounterComponent);

    await waitFor(() => expect(container.textContent).toContain('visitors.total 4,218 · today 37'));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/visits', { method: 'POST' });
    expect(screen.getByText(/Unique visitors/)).toBeTruthy();
  });

  it('REQ-COUNT-005 shows nothing when the endpoint fails', async () => {
    stubFetch(async () => new Response('{}', { status: 503 }));

    const { container, fixture } = await render(VisitorCounterComponent);
    await fixture.whenStable();

    expect(container.textContent?.trim()).toBe('');
  });

  it('REQ-COUNT-005 shows nothing when the network fails', async () => {
    stubFetch(async () => {
      throw new TypeError('network down');
    });

    const { container, fixture } = await render(VisitorCounterComponent);
    await fixture.whenStable();

    expect(container.textContent?.trim()).toBe('');
  });

  it('REQ-COUNT-005 shows nothing when the body is not two whole numbers', async () => {
    stubFetch(async () => Response.json({ total: 'many', today: 1 }));

    const { container, fixture } = await render(VisitorCounterComponent);
    await fixture.whenStable();

    expect(container.textContent?.trim()).toBe('');
  });

  it('REQ-COUNT-005 shows nothing while the counter is not configured (204 No Content)', async () => {
    stubFetch(async () => new Response(null, { status: 204 }));

    const { container, fixture } = await render(VisitorCounterComponent);
    await fixture.whenStable();

    expect(container.textContent?.trim()).toBe('');
  });
});
