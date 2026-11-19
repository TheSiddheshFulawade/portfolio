import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import content from '../src/generated/content.json' with { type: 'json' };

// REQ-PAGE-001, REQ-UI-003, REQ-UI-005: every published route renders from the static output.
const routes = [
  '/',
  '/experience',
  '/projects',
  ...content.projects.map((p) => `/projects/${p.id}`),
  '/about',
  '/contact',
];

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
    expect(html, route).toContain(`<link rel="canonical" href="${content.site.url}${route}"`);
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
  expect(locs).toEqual(routes.map((r) => content.site.url + r));
  expect(robots).toContain(`Sitemap: ${content.site.url}/sitemap.xml`);
  expect((await request.get('/og.png')).headers()['content-type']).toBe('image/png');
});
