import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import content from '../src/generated/content.json' with { type: 'json' };
import home from '../src/generated/home.json' with { type: 'json' };

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

for (const width of [320, 960, 1024, 1100, 1280, 1440]) {
  test(`REQ-UI-003 no route scrolls sideways at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });

    for (const route of routes) {
      await page.goto(route, { waitUntil: 'networkidle' });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, route).toBe(0);
    }
  });
}

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
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Experience', exact: true })
    .focus();
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

    // Worst case: the media query sees 896 px while a classic scrollbar narrows the layout to 881 px.
    // Set through the CSSOM: the site's CSP blocks an injected style element.
    const width = 896 - scrollbar;
    await page.setViewportSize({ width: 896, height: 800 });
    await page.evaluate((px) => {
      document.documentElement.style.width = `${px}px`;
    }, width);
    const layout = await page.evaluate(() => {
      const bar = document.querySelector('header .bar')!;
      const inner = [...bar.querySelectorAll('a, button')].filter((e) => e.getClientRects().length);
      return {
        viewport: window.innerWidth,
        root: document.documentElement.getBoundingClientRect().width,
        bar: bar.getBoundingClientRect().width,
        right: Math.max(...inner.map((e) => e.getBoundingClientRect().right)),
      };
    });
    expect(layout.viewport).toBe(896);
    expect(layout.root).toBe(width);
    expect(layout.bar).toBeLessThanOrEqual(width);
    expect(layout.right).toBeLessThanOrEqual(width);

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

// ---- Spec 005 RD-04: shell (REQ-UI-101, 102, 104, REQ-MOT-101 to 103) ----------------------------------

const shellSite = content.site as unknown as {
  footer: { navLabel: string; note: string; sourceLabel: string; sourceUrl: string };
  contact: { heading: string };
};
const allPaths = [...routes, '/no-such-page'];

for (const route of allPaths) {
  test(`REQ-UI-102 ${route} has one footer landmark with site links, profiles, email, location, note, source and counter slot`, async ({
    page,
  }) => {
    await page.goto(route, { waitUntil: 'networkidle' });
    const footer = page.getByRole('contentinfo');

    await expect(footer).toHaveCount(1);
    await expect(footer.getByRole('navigation', { name: shellSite.footer.navLabel })).toBeVisible();
    for (const item of content.site.nav) {
      await expect(
        footer
          .getByRole('navigation', { name: shellSite.footer.navLabel })
          .locator(`a[href="${item.path}"]`),
      ).toHaveCount(1);
    }
    for (const link of content.profile.links) {
      await expect(footer.locator(`a[href="${link.url}"]`)).not.toHaveCount(0);
    }
    await expect(footer.locator(`a[href="mailto:${content.profile.email}"]`)).toHaveCount(1);
    await expect(footer).toContainText(content.profile.location);
    await expect(footer).toContainText(shellSite.footer.note);
    await expect(footer.locator(`a[href="${shellSite.footer.sourceUrl}"]`)).toHaveCount(1);
    await expect(footer.locator('sf-visitor-counter')).toHaveCount(1);
    // Last thing on the page: nothing after the footer.
    expect(
      await page.evaluate(() => {
        const f = document.querySelector('footer')!;
        return f.getBoundingClientRect().bottom >= document.documentElement.scrollHeight - 1;
      }),
    ).toBe(true);
  });
}

for (const route of ['/', '/projects', '/about']) {
  test(`REQ-UI-101 ${route} shows the contact section above the footer`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'networkidle' });

    const section = page.getByRole('region', { name: shellSite.contact.heading });
    await expect(section).toBeVisible();
    await expect(section.locator(`a[href="mailto:${content.profile.email}"]`)).toHaveCount(1);
    const [s, f] = await Promise.all([section.boundingBox(), page.locator('footer').boundingBox()]);
    expect(s!.y + s!.height).toBeLessThanOrEqual(f!.y + 1);
  });
}

for (const route of allPaths) {
  test(`REQ-MOT-101 ${route} nothing is animating 5 s after load`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'networkidle' });

    await page.waitForTimeout(5000);

    // Time-based animations only: a scroll-driven one (the Home technology strip, REQ-HOME-102) is listed too,
    // but it moves only while the page scrolls.
    expect(
      await page.evaluate(() =>
        document
          .getAnimations()
          .filter((a) => a.timeline === document.timeline)
          .map((a) => `${a.constructor.name} ${(a as CSSAnimation).animationName ?? ''}`),
      ),
    ).toEqual([]);
  });

  test(`REQ-MOT-102 ${route} with reduced motion nothing is animating right after load`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(route, { waitUntil: 'networkidle' });

    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });
}

test('REQ-UI-101 the header stays at the top of the viewport while the page scrolls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 400 });
  await page.goto('/projects', { waitUntil: 'networkidle' });
  const header = page.locator('header').first();
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(1000);

  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForFunction(() => window.scrollY > 400);

  const box = await header.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.y).toBeLessThanOrEqual(1);
  await expect(header).toBeInViewport();
});

test('REQ-A11Y-101 a focused link is not hidden behind the sticky header (WCAG 2.2 focus not obscured)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto('/projects', { waitUntil: 'networkidle' });

  await page.locator('main a').last().focus();
  const { link, headerBottom } = await page.evaluate(() => ({
    link: document.activeElement!.getBoundingClientRect().top,
    headerBottom: document.querySelector('header')!.getBoundingClientRect().bottom,
  }));

  expect(link).toBeGreaterThanOrEqual(headerBottom - 1);
});

test('REQ-UI-104 the 404 page has a plain message, a way home, and a decorative dot field that is drawn', async ({
  page,
}) => {
  await page.goto('/no-such-page', { waitUntil: 'networkidle' });

  const canvas = page.locator('main canvas');
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toHaveAttribute('aria-hidden', 'true');
  const home = page
    .locator('main')
    .getByRole('link', { name: content.site.pages.notFound.action! });
  await expect(home).toBeVisible();
  await expect(home).toHaveAttribute('href', '/');
  const painted = await canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) n++;
    return { n, w: c.width, h: c.height };
  });
  expect(painted.w).toBeGreaterThan(0);
  expect(painted.n).toBeGreaterThan(50);

  await home.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('h1')).toBeVisible();
});

for (const reduce of [true, false]) {
  test(`REQ-MOT-102 REQ-MOT-103 the 404 field is drawn at once and runs no frame loop while idle (reduced motion ${reduce})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: reduce ? 'reduce' : 'no-preference' });
    await page.addInitScript(() => {
      const w = window as unknown as { frames: number };
      w.frames = 0;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => {
        w.frames++;
        return raf(cb);
      };
    });
    await page.goto('/no-such-page', { waitUntil: 'networkidle' });
    const drawn = await page.locator('main canvas').evaluate((el) => {
      const c = el as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      return d.some((v, i) => i % 4 === 3 && v > 0);
    });
    expect(drawn).toBe(true);

    // A running loop asks for about 60 frames a second; a settled page asks for almost none.
    await page.waitForTimeout(1500);
    await page.evaluate(() => ((window as unknown as { frames: number }).frames = 0));
    await page.waitForTimeout(1000);

    expect(
      await page.evaluate(() => (window as unknown as { frames: number }).frames),
    ).toBeLessThan(5);
  });
}

// --- Home (spec 005 RD-05: REQ-HOME-101, 103, 104, REQ-MOT-101, 103) ---------------------------
const field = home.field as Record<string, any>;
const fieldHeading: string = field['heading'];

async function readCounters(page: Page): Promise<Record<string, number>> {
  const section = page.getByRole('region', { name: fieldHeading });
  const texts = await section.getByRole('listitem').allInnerTexts();
  const out: Record<string, number> = {};
  for (const [key, label] of Object.entries<string>(field['counters'])) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
      `^(?:${escaped}\\s*:?\\s*([-−]?[\\d,]+)|([-−]?[\\d,]+)\\s*:?\\s*${escaped})$`,
    );
    const hit = texts.map((t) => pattern.exec(t.replace(/\s+/g, ' ').trim())).find(Boolean);
    expect(hit, `counter ${label}`).toBeTruthy();
    out[key] = Number((hit![1] ?? hit![2]).replace(/,/g, '').replace('−', '-'));
  }
  return out;
}

test('REQ-HOME-101 the Home headline is complete in the raw HTML with JavaScript disabled', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(baseURL!, { waitUntil: 'load' });
  const { lead, phrases } = home.hero;

  const visible = await page.locator('h1').evaluate((h1) => {
    const clone = h1.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.visually-hidden').forEach((n) => n.remove());
    return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
  });
  await context.close();

  expect(visible).toBe(`${lead} ${phrases[phrases.length - 1]}`);
});

test('REQ-HOME-103 each failure button returns to rest, and committed = reachable + unreachable at rest', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  const section = page.getByRole('region', { name: fieldHeading });

  for (const mode of ['node', 'partition', 'duplicate'] as const) {
    await section.getByRole('button', { name: field['actions'][mode] }).click();
    await expect(section.getByRole('status')).toHaveText(field['status'][`${mode}Done`], {
      timeout: 15_000,
    });

    const c = await readCounters(page);
    expect(c['committed'], mode).toBe(c['reachable'] + c['unreachable']);
    expect(c['unreachable']).toBe(0);
    expect(c['recovering']).toBe(0);
    expect(c['net']).toBe(0);
  }
  const final = await readCounters(page);
  expect(final['duplicates']).toBe(final['committed'] / 2);
});

test('REQ-HOME-103 dragging over the canvas changes no counter', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  const section = page.getByRole('region', { name: fieldHeading });
  const canvas = section.locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const drag = async () => {
    await page.mouse.move(box.x + 10, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3, { steps: 12 });
    await page.mouse.move(box.x + box.width - 10, box.y + box.height - 10, { steps: 12 });
    await page.mouse.up();
  };

  const before = await readCounters(page);
  await drag();
  expect(await readCounters(page)).toEqual(before);

  await section.getByRole('button', { name: field['actions']['partition'] }).click();
  await page.waitForTimeout(300);
  await drag();
  const c = await readCounters(page);
  expect(c['committed']).toBe(c['reachable'] + c['unreachable'] + c['recovering']);
  expect(c['net']).toBe(0);
});

test('REQ-HOME-104 Home names no employer or institution', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  const text = (await page.locator('main').innerText()).toLowerCase();
  const names = [
    ...content.experience.map((e) => e.company),
    ...content.education.degrees.map((d) => d.institution),
  ].flatMap((n) => [n, ...n.split(/[(),]/).map((s) => s.trim())]);

  for (const name of new Set(names.filter((n) => n.length >= 4))) {
    expect(text, name).not.toContain(name.toLowerCase());
  }
});

test('REQ-MOT-101 REQ-MOT-103 nothing runs an animation frame 6 s after Home loads', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as { frames: number };
    w.frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => {
      w.frames++;
      return raf(cb);
    };
  });
  await page.goto('/', { waitUntil: 'networkidle' });

  await page.waitForTimeout(6_000);
  await page.evaluate(() => ((window as unknown as { frames: number }).frames = 0));
  await page.waitForTimeout(1_500);

  expect(await page.evaluate(() => (window as unknown as { frames: number }).frames)).toBe(0);
});

// REQ-UI-103: the label rail is sticky from 60rem (960 px) and not below.
for (const [width, expected] of [
  [959, 'static'],
  [960, 'sticky'],
  [1280, 'sticky'],
] as const) {
  test(`REQ-UI-103 the Experience rail is ${expected} at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/experience', { waitUntil: 'networkidle' });

    const position = await page
      .locator('article aside')
      .first()
      .evaluate((el) => getComputedStyle(el).position);

    expect(position).toBe(expected);
  });
}

// REQ-EXP-101: skill evidence on About links to a role by fragment; the heading must clear the sticky header.
test('REQ-EXP-101 an About evidence link lands on the role with its heading below the sticky header', async ({
  page,
}) => {
  const roleIds = new Set(content.experience.map((r) => r.id));
  const id = content.skills
    .flatMap((g) => g.skills.flatMap((s) => s.evidence))
    .find((e) => roleIds.has(e))!;
  const role = content.experience.find((r) => r.id === id)!;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/about', { waitUntil: 'networkidle' });

  await page.locator(`main a[href="/experience#${id}"]`).first().click();

  await expect(page).toHaveURL(new RegExp(`/experience/?#${id}$`));
  const heading = page.getByRole('heading', { level: 2, name: role.title, exact: true });
  const header = page.getByRole('banner').first();
  await expect
    .poll(async () => {
      const h = await heading.boundingBox();
      const b = await header.boundingBox();
      return h && b ? h.y >= b.y + b.height - 1 && h.y < 800 : false;
    })
    .toBe(true);
});
