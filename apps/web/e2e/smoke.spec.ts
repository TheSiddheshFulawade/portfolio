import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import content from '../src/generated/content.json' with { type: 'json' };

// REQ-PAGE-001, REQ-UI-003, REQ-UI-005: every published route renders from the static output.
const routes = [
  '/',
  '/experience',
  '/projects',
  ...content.projects.map((p) => `/projects/${p.id}`),
  // Notes are listed only once one is published (REQ-NOTE-002), matching the sitemap.
  ...(content.notes.length ? ['/notes', ...content.notes.map((n) => `/notes/${n.id}`)] : []),
  '/about',
  '/contact',
];

// REQ-SEO-003: Cloudflare Pages answers /about with a 308 to /about/, so public URLs end in a slash.
const publicUrl = (route: string) => content.site.url + (route.endsWith('/') ? route : `${route}/`);

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

async function seriousViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

for (const route of routes) {
  test(`REQ-PAGE-001 ${route} returns 200, has one h1, no console errors and no serious axe violations`, async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);

    const response = await page.goto(route, { waitUntil: 'networkidle' });

    expect(response?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
    expect(errors).toEqual([]);
    expect(await seriousViolations(page)).toEqual([]);
  });
}

test('REQ-PAGE-001 an unknown path returns 404 with the not-found page', async ({ page }) => {
  const response = await page.goto('/no-such-page', { waitUntil: 'networkidle' });

  expect(response?.status()).toBe(404);
  await expect(page.locator('h1')).toHaveText(content.site.pages.notFound.heading!);
  expect(await seriousViolations(page)).toEqual([]);
});

test('REQ-UI-003 no route scrolls sideways at 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });

  for (const route of routes) {
    await page.goto(route, { waitUntil: 'networkidle' });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, route).toBe(0);
  }
});

test('REQ-UI-005 keyboard: the mobile menu opens, navigates and moves focus to the new heading', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/', { waitUntil: 'networkidle' });
  const menu = page.getByRole('button', { name: content.site.ui['menu'] });
  await expect(menu).toHaveAttribute('aria-expanded', 'false');

  await menu.focus();
  await page.keyboard.press('Enter');
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('link', { name: 'Experience', exact: true }).focus();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/experience$/);
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('h1')).toBeFocused();
});

test('REQ-SEO-001 every route ships its title, description, canonical URL and Open Graph image in the HTML', async ({
  request,
}) => {
  for (const route of routes) {
    const html = await (await request.get(route)).text();

    expect(html, route).toMatch(
      /<title>[^<]+ · Siddhesh Fulawade<\/title>|<title>Siddhesh Fulawade · /,
    );
    expect(html, route).toMatch(/<meta name="description" content="[^"]{20,}"/);
    expect(html, route).toContain(`<link rel="canonical" href="${publicUrl(route)}"`);
    expect(html, route).toContain(`<meta property="og:image" content="${content.site.url}/og.png"`);
  }
});

test('REQ-SEO-001 the 404 page is noindex and has no canonical URL', async ({ request }) => {
  const html = await (await request.get('/no-such-page')).text();

  expect(html).toContain('<meta name="robots" content="noindex"');
  expect(html).not.toContain('rel="canonical"');
});

test('REQ-SEO-002 the sitemap lists exactly the smoke-tested routes, and robots.txt points at it', async ({
  request,
}) => {
  const sitemap = await (await request.get('/sitemap.xml')).text();
  const robots = await (await request.get('/robots.txt')).text();

  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(locs).toEqual(routes.map(publicUrl));
  expect(robots).toContain(`Sitemap: ${content.site.url}/sitemap.xml`);
  expect((await request.get('/og.png')).headers()['content-type']).toBe('image/png');
});

test('REQ-SEC-001 every response carries the security headers and a CSP without unsafe-inline', async ({
  request,
}) => {
  const headers = (await request.get('/')).headers();
  const csp = headers['content-security-policy'] ?? '';

  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).not.toMatch(/unsafe-inline|unsafe-eval/);
  expect(headers['strict-transport-security']).toContain('max-age=63072000');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
});

test('REQ-SEC-001 no CSP violations on any route or during client-side navigation', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as { cspViolations: string[] };
    w.cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      w.cspViolations.push(`${e.violatedDirective} ${e.blockedURI || 'inline'} ${e.sample}`),
    );
  });
  const violations = () =>
    page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations);

  for (const route of [...routes, '/no-such-page']) {
    await page.goto(route, { waitUntil: 'networkidle' });
    expect(await violations(), route).toEqual([]);
  }

  // Client-side navigation loads lazy components, which add their styles at runtime.
  await page.goto('/', { waitUntil: 'networkidle' });
  for (const item of content.site.nav) {
    await page.locator(`header a[href="${item.path}"]`).first().dispatchEvent('click');
    await expect(page).toHaveURL(new RegExp(`${item.path === '/' ? '/$' : item.path}$`));
    await page.waitForLoadState('networkidle');
  }
  await page.locator('header a[href="/projects"]').first().dispatchEvent('click');
  await expect(page).toHaveURL(/\/projects$/);
  await page.locator(`main a[href="/projects/${content.projects[0].id}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/projects/${content.projects[0].id}$`));
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: content.site.ui['themeToggle'] }).click();
  expect(await violations()).toEqual([]);
});

test('REQ-COUNT-001 REQ-COUNT-005 the footer shows the visitor counter without shifting the layout', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as { shift: number };
    w.shift = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as { value: number }[])
        w.shift += entry.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });

  await page.goto('/', { waitUntil: 'networkidle' });

  await expect(page.locator('footer')).toContainText('visitors.total 4,218 · today 37');
  expect(
    await page.evaluate(() => (window as unknown as { shift: number }).shift),
  ).toBeLessThanOrEqual(0.05);
});

// REQ-UI-001: the desktop nav starts at 896 px so seven items still share one row with brand and theme button.
async function padNavToSeven(page: Page) {
  await page.evaluate(() => {
    const ul = document.querySelector('header nav ul')!;
    while (ul.children.length < 7) ul.appendChild(ul.lastElementChild!.cloneNode(true));
    const last = ul.lastElementChild!.querySelector('a')!;
    last.textContent = 'Lab';
    last.removeAttribute('href');
  });
}

async function headerRow(page: Page) {
  return page.evaluate(() => {
    const centre = (sel: string) => {
      const r = document.querySelector(sel)!.getBoundingClientRect();
      return r.top + r.height / 2;
    };
    return {
      barHeight: document.querySelector('header .bar')!.getBoundingClientRect().height,
      brand: centre('header .brand'),
      nav: centre('header nav'),
      theme: centre('header .theme-button'),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

for (const scrollbar of [0, 15]) {
  test(`REQ-UI-001 at 896 px the desktop nav shows and seven items stay on one header row (${scrollbar} px scrollbar)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 800 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await padNavToSeven(page);
    const wide = await headerRow(page);

    // Media queries see the full viewport; a classic scrollbar only narrows the layout width.
    await page.setViewportSize({ width: 896 + scrollbar, height: 800 });
    // Worst case: the media query sees 896 px while the layout is 881 px.
    if (scrollbar) await page.addStyleTag({ content: `html { width: 881px; }` });
    const layout = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      width: document.documentElement.getBoundingClientRect().width,
    }));
    expect(layout.client).toBe(scrollbar ? 881 : 896);
    expect(layout.width).toBe(scrollbar ? 881 : 896);

    await expect(page.locator('header nav')).toBeVisible();
    await expect(page.locator('header .menu-button')).toBeHidden();
    expect(await page.locator('header nav li').count()).toBeGreaterThanOrEqual(7);
    const row = await headerRow(page);

    expect(row.barHeight).toBeCloseTo(wide.barHeight, 0);
    expect(Math.abs(row.nav - row.brand)).toBeLessThanOrEqual(2);
    expect(Math.abs(row.theme - row.brand)).toBeLessThanOrEqual(2);
    expect(row.overflow).toBe(0);
  });
}

test('REQ-UI-001 at 895 px the Menu button shows and the nav is collapsed', async ({ page }) => {
  await page.setViewportSize({ width: 895, height: 800 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await padNavToSeven(page);

  await expect(page.getByRole('button', { name: content.site.ui['menu'] })).toBeVisible();
  await expect(page.locator('header nav')).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
});
