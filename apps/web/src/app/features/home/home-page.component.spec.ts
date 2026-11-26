import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { fireEvent, render, screen, within } from '@testing-library/angular';
import { ContentService } from '../../core/content/content.service';
import { Profile } from '../../core/content/content.types';
import { decisions, homeContent } from '../../core/content/home-content';
import { formatMonthRange } from '../../shared/format/month';
import { HomePageComponent } from './home-page.component';

// Spec 005 RD-05 (REQ-HOME-101 to 105, REQ-UI-105, REQ-ACC-003, REQ-MOT-101 to 103). All copy is read from
// ContentService. Assumed new content, in the Home-only data (homeContent): field { heading, intro[], actions{node,partition,duplicate},
// counters{committed,reachable,unreachable,recovering,duplicates,net}, status{rest,node,nodeDone,partition,
// partitionDone,duplicate,duplicateDone}, caption } and site.ui.{seeSystems,readExperience,fullExperience,
// chosen,rejected,reason,cost,evidence}.
// Assumed markup: the technology strip is a list with data-testid="tech-strip"; the invariant section is a
// region named site.field.heading with three buttons, a list of counters (one item per counter, "label value"),
// a role="status" element and one canvas[aria-hidden=true]. Each other Home section is a region named by
// site.sections.*. Visually hidden text uses the global .visually-hidden class.

interface FieldContent {
  heading: string;
  intro: string[];
  actions: Record<'node' | 'partition' | 'duplicate', string>;
  counters: Record<
    'committed' | 'reachable' | 'unreachable' | 'recovering' | 'duplicates' | 'net',
    string
  >;
  status: Record<
    | 'rest'
    | 'node'
    | 'nodeReplay'
    | 'nodeDone'
    | 'partition'
    | 'partitionDone'
    | 'duplicate'
    | 'duplicateDone',
    string
  >;
  caption: string;
}

const fieldCopy = (): FieldContent => homeContent.field as FieldContent;

/** Real content with part of the profile replaced. */
function profileWith(patch: Partial<Profile>) {
  return {
    provide: ContentService,
    useFactory: () => {
      const real = new ContentService();
      return Object.assign(real, {
        profile: { ...real.profile, ...patch },
      }) as unknown as ContentService;
    },
  };
}
const contentWith = (resume: { label: string; url: string } | undefined) => profileWith({ resume });

let rafQueue: FrameRequestCallback[] = [];

function stubBrowser(reduce: boolean) {
  const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(900);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(360);
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: reduce && q.includes('prefers-reduced-motion'),
    media: q,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
  }));
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => rafQueue.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private cb: IntersectionObserverCallback) {}
      observe(el: Element) {
        this.cb([{ isIntersecting: true, target: el } as IntersectionObserverEntry], this as never);
      }
      unobserve() {
        /* nothing to undo */
      }
      disconnect() {
        /* nothing to undo */
      }
    },
  );
}

/** Moves the clock on in 16 ms frames, running timers and queued animation frames. */
function advance(ms: number) {
  for (let t = 0; t < ms; t += 16) {
    vi.advanceTimersByTime(16);
    const frames = rafQueue;
    rafQueue = [];
    for (const f of frames) f(performance.now());
  }
}

async function setup(options: { reduce?: boolean; providers?: unknown[] } = {}) {
  rafQueue = [];
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
  });
  stubBrowser(options.reduce ?? false);
  const view = await render(HomePageComponent, {
    providers: [provideRouter([]), ...((options.providers as never[]) ?? [])],
  });
  return { ...view, content: TestBed.inject(ContentService) };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The h1's visible text: everything except visually-hidden helper text. */
function visibleHeadline(): string {
  const clone = screen.getByRole('heading', { level: 1 }).cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.visually-hidden').forEach((n) => n.remove());
  return norm(clone.textContent);
}

const region = (name: string) => screen.getByRole('region', { name });

/** Reads the counters list: one item per counter, "label value" in either order. */
function counters(): Record<keyof FieldContent['counters'], number> {
  const labels = fieldCopy().counters;
  const section = region(fieldCopy().heading);
  const items = within(section).getAllByRole('listitem');
  const out = {} as Record<keyof FieldContent['counters'], number>;
  for (const key of Object.keys(labels) as (keyof FieldContent['counters'])[]) {
    const label = escape(labels[key]);
    const pattern = new RegExp(
      `^(?:${label}\\s*:?\\s*([-−]?[\\d,]+)|([-−]?[\\d,]+)\\s*:?\\s*${label})$`,
    );
    const hits = items
      .map((li) => pattern.exec(norm(li.textContent)))
      .filter((m): m is RegExpExecArray => m !== null);
    expect(
      hits,
      `counter "${labels[key]}" is one list item of the form "label value"`,
    ).toHaveLength(1);
    out[key] = Number((hits[0][1] ?? hits[0][2]).replace(/,/g, '').replace('−', '-'));
  }
  return out;
}

describe('HomePageComponent', () => {
  describe('hero and headline (REQ-HOME-101)', () => {
    it('REQ-HOME-101 renders no <main> and exactly one h1', async () => {
      await setup();

      expect(screen.queryAllByRole('main')).toHaveLength(0); // the app shell owns <main>
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    });

    it('REQ-HOME-101 the prerendered headline is hero.lead plus the last phrase, complete before any timer runs', async () => {
      await setup();
      const { lead, phrases } = homeContent.hero;

      expect(visibleHeadline()).toBe(`${lead} ${phrases[phrases.length - 1]}`);
    });

    it('REQ-HOME-101 screen readers get hero.srSentence once, as the heading name', async () => {
      const { container } = await setup();
      const { srSentence } = homeContent.hero;

      expect(screen.getByRole('heading', { level: 1, name: srSentence })).toBeTruthy();
      expect(norm(container.textContent).split(srSentence).length - 1).toBeLessThanOrEqual(1);
    });

    it('REQ-HOME-101 REQ-MOT-101 the cycling phrase ends on the prerendered phrase within 5 s and stays there', async () => {
      await setup();
      const { lead, phrases } = homeContent.hero;
      const final = `${lead} ${phrases[phrases.length - 1]}`;

      advance(5_000);
      expect(visibleHeadline()).toBe(final);
      expect(
        screen.getByRole('heading', { level: 1, name: homeContent.hero.srSentence }),
      ).toBeTruthy();
      advance(10_000);
      expect(visibleHeadline()).toBe(final);
    });

    it('REQ-HOME-101 REQ-MOT-102 with reduced motion the headline never changes', async () => {
      await setup({ reduce: true });
      const { lead, phrases } = homeContent.hero;
      const final = `${lead} ${phrases[phrases.length - 1]}`;

      for (let t = 0; t < 8_000; t += 16) {
        advance(16);
        expect(visibleHeadline()).toBe(final);
      }
    });

    it('REQ-PAGE-008 links to the resume when the profile has one', async () => {
      await setup({ providers: [contentWith({ label: 'Resume (PDF)', url: '/resume.pdf' })] });

      expect(screen.getByRole('link', { name: 'Resume (PDF)' }).getAttribute('href')).toBe(
        '/resume.pdf',
      );
    });

    it('REQ-PAGE-008 shows no resume link when the profile has none', async () => {
      const { container } = await setup({ providers: [contentWith(undefined)] });

      expect(screen.queryByRole('link', { name: /resume/i })).toBeNull();
      expect(container.querySelector('a[href*="resume.pdf"]')).toBeNull();
    });

    it('REQ-HOME-104 the hero links to the systems and to the experience pages', async () => {
      await setup();
      const hrefs = (name: string) =>
        screen.getAllByRole('link', { name }).map((a) => a.getAttribute('href'));

      expect(hrefs(homeContent.ui['seeSystems'])).toContain('/projects');
      expect(hrefs(homeContent.ui['readExperience'])).toContain('/experience');
    });
  });

  describe('photo (REQ-UI-105)', () => {
    it('REQ-UI-105 without profile.photo there is no image and no placeholder', async () => {
      const { container } = await setup({ providers: [profileWith({ photo: undefined })] });

      expect(container.querySelectorAll('img')).toHaveLength(0);
      expect(container.querySelector('[class*="placeholder" i], [data-placeholder]')).toBeNull();
    });

    it('REQ-UI-105 with profile.photo it shows one image with alt, width and height', async () => {
      const photo = {
        src: '/photo.webp',
        alt: 'Portrait of the author',
        width: 1200,
        height: 1500,
      };
      const { container } = await setup({ providers: [profileWith({ photo })] });
      const images = container.querySelectorAll('img');

      expect(images).toHaveLength(1);
      expect(images[0].getAttribute('src')).toContain('photo.webp');
      expect(images[0].getAttribute('alt')).toBe(photo.alt);
      expect(images[0].getAttribute('width')).toBe('1200');
      expect(images[0].getAttribute('height')).toBe('1500');
    });
  });

  describe('technology strip (REQ-HOME-102)', () => {
    it('REQ-HOME-102 lists each distinct technology once, as a list, with no repeated copy for scrolling', async () => {
      const { content } = await setup();
      const strip = screen.getByTestId('tech-strip');
      const names = within(strip)
        .getAllByRole('listitem')
        .map((li) => norm(li.textContent));
      const known = new Set<string>([
        ...content.projects.flatMap((p) => p.stack),
        ...content.experience.flatMap((e) => e.stack),
        ...content.skills.flatMap((g) => g.skills.map((s) => s.name)),
      ]);

      expect(strip.tagName === 'UL' || strip.getAttribute('role') === 'list').toBe(true);
      expect(names.length).toBeGreaterThan(5);
      expect(new Set(names).size).toBe(names.length);
      for (const name of names)
        expect(known.has(name), `${name} is a technology in content`).toBe(true);
      // Every featured project's stack is on the strip.
      for (const tech of content.featuredProjects.flatMap((p) => p.stack)) {
        expect(names).toContain(tech);
      }
    });
  });

  describe('invariant field (REQ-HOME-103, REQ-ACC-003)', () => {
    it('REQ-HOME-103 shows the heading, intro, caption, three buttons, a hidden canvas and a polite status', async () => {
      await setup();
      const copy = fieldCopy();
      const section = region(copy.heading);

      for (const p of copy.intro) expect(within(section).getByText(p)).toBeTruthy();
      expect(within(section).getByText(copy.caption)).toBeTruthy();
      for (const label of Object.values(copy.actions)) {
        expect(within(section).getByRole('button', { name: label })).toBeTruthy();
      }
      expect(within(section).getAllByRole('button')).toHaveLength(3);
      const canvas = section.querySelectorAll('canvas');
      expect(canvas).toHaveLength(1);
      expect(canvas[0].getAttribute('aria-hidden')).toBe('true');
      const status = within(section).getByRole('status');
      expect(norm(status.textContent)).toBe(copy.status.rest);
      expect(['polite', null]).toContain(status.getAttribute('aria-live'));
      expect(homeContent.sections).toBeDefined();
    });

    it('REQ-HOME-103 the counters are a text list with content labels; at rest committed = reachable and nothing else', async () => {
      await setup();
      const c = counters();

      expect(c.committed).toBeGreaterThan(0);
      expect(c.committed % 2).toBe(0); // two entries per transaction
      expect(c.reachable).toBe(c.committed);
      expect(c.unreachable).toBe(0);
      expect(c.recovering).toBe(0);
      expect(c.duplicates).toBe(0);
      expect(c.net).toBe(0);
    });

    it('REQ-HOME-103 pointer movement over the canvas changes no counter, at rest or during a failure', async () => {
      await setup();
      const copy = fieldCopy();
      const section = region(copy.heading);
      const canvas = section.querySelector('canvas')!;
      const drag = () => {
        fireEvent.pointerDown(canvas, { clientX: 20, clientY: 20, buttons: 1 });
        fireEvent.pointerMove(canvas, { clientX: 400, clientY: 120, buttons: 1 });
        fireEvent.pointerMove(canvas, { clientX: 700, clientY: 200, buttons: 1 });
        fireEvent.pointerUp(canvas);
      };

      const atRest = counters();
      drag();
      advance(500);
      expect(counters()).toEqual(atRest);

      fireEvent.click(within(section).getByRole('button', { name: copy.actions.partition }));
      advance(300);
      const during = counters();
      drag();
      expect(counters()).toEqual(during);
      expect(during.committed).toBe(during.reachable + during.unreachable + during.recovering);
    });

    for (const mode of ['node', 'partition', 'duplicate'] as const) {
      const done = `${mode}Done` as 'nodeDone' | 'partitionDone' | 'duplicateDone';

      it(`REQ-HOME-103 REQ-MOT-102 ${mode}: pressing the button runs to rest; with reduced motion the final counters and text are there at once and identical`, async () => {
        // Animated run
        const animated = await setup();
        const copy = fieldCopy();
        fireEvent.click(
          within(region(copy.heading)).getByRole('button', { name: copy.actions[mode] }),
        );
        expect(norm(within(region(copy.heading)).getByRole('status').textContent)).toBe(
          copy.status[mode],
        );
        for (let t = 0; t < 20_000; t += 16) {
          advance(16);
          const c = counters();
          expect(c.net).toBe(0);
          expect(c.committed).toBe(c.reachable + c.unreachable + c.recovering);
          if (c.recovering > 0) expect(mode).toBe('node');
        }
        const finalAnimated = counters();
        expect(norm(within(region(copy.heading)).getByRole('status').textContent)).toBe(
          copy.status[done],
        );
        expect(finalAnimated.reachable).toBe(finalAnimated.committed);
        expect(finalAnimated.duplicates).toBe(
          mode === 'duplicate' ? finalAnimated.committed / 2 : 0,
        );
        expect(animated.container.isConnected).toBe(true);
        animated.fixture.destroy();
        animated.container.remove();
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();

        // Reduced motion: no time passes at all
        TestBed.resetTestingModule(); // a second render in one test needs a fresh test module
        await setup({ reduce: true });
        fireEvent.click(
          within(region(copy.heading)).getByRole('button', { name: copy.actions[mode] }),
        );

        expect(counters()).toEqual(finalAnimated);
        expect(norm(within(region(copy.heading)).getByRole('status').textContent)).toBe(
          copy.status[done],
        );
      });
    }

    it('REQ-HOME-103 REQ-MOT-103 once at rest the page schedules no further frames or timers', async () => {
      await setup();
      const copy = fieldCopy();
      fireEvent.click(
        within(region(copy.heading)).getByRole('button', { name: copy.actions.node }),
      );
      advance(20_000);

      rafQueue = [];
      advance(2_000);

      expect(rafQueue).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('selected systems (REQ-HOME-104)', () => {
    it('REQ-HOME-104 lists the featured projects with tagline, stack, status and a link to each page', async () => {
      const { content } = await setup();
      const section = region(homeContent.sections['selected']);
      const headings = within(section).getAllByRole('heading', { level: 3 });

      expect(headings.map((h) => norm(h.textContent))).toEqual(
        content.featuredProjects.map((p) => p.title),
      );
      for (const project of content.featuredProjects) {
        expect(
          within(section).getByRole('link', { name: project.title }).getAttribute('href'),
        ).toBe(`/projects/${project.id}`);
        expect(within(section).getByText(project.tagline)).toBeTruthy();
        expect(within(section).getAllByText(project.status).length).toBeGreaterThan(0);
        const item = within(section).getByRole('link', { name: project.title }).closest('li')!;
        for (const tech of project.stack) expect(within(item).getByText(tech)).toBeTruthy();
      }
      expect(
        within(section)
          .getAllByRole('link', { name: homeContent.ui['seeSystems'] })
          .map((a) => a.getAttribute('href')),
      ).toContain('/projects');
      expect(norm(section.textContent)).toContain(homeContent.sections['selectedIntro']);
    });
  });

  describe('experience summary (REQ-HOME-104)', () => {
    it('REQ-HOME-104 shows each role with title, dates, location and summary, and links to the full page', async () => {
      const { content } = await setup();
      const section = region(homeContent.sections['experience']);

      for (const role of content.experience) {
        const dates = formatMonthRange(
          role.start,
          role.end,
          content.site.ui['present'],
          content.site.locale,
        );
        expect(within(section).getByText(role.title)).toBeTruthy();
        expect(norm(section.textContent)).toContain(dates);
        expect(norm(section.textContent)).toContain(role.location);
        expect(within(section).getByText(role.homeSummary ?? role.summary)).toBeTruthy();
      }
      expect(
        within(section)
          .getAllByRole('link', { name: homeContent.ui['fullExperience'] })
          .map((a) => a.getAttribute('href')),
      ).toContain('/experience');
    });

    it('REQ-HOME-104 no employer or institution name appears anywhere on Home', async () => {
      const { content, container } = await setup();
      const text = norm(container.textContent).toLowerCase();
      const html = container.innerHTML.toLowerCase();
      const names = [
        ...content.experience.map((e) => e.company),
        ...content.education.degrees.map((d) => d.institution),
      ];
      const parts = names.flatMap((n) => [n, ...n.split(/[(),]/).map((s) => s.trim())]);
      // Constitution 6.2 and the brief: employers named in the work history, by their short names too.
      const known = ['ReBIT', 'e-Kuber', 'Lumu', 'NanoBios', 'IIT Bombay', 'Pillai'];

      for (const name of new Set([...parts, ...known].filter((s) => s.length >= 4))) {
        expect(text, `"${name}" must not appear in the text`).not.toContain(name.toLowerCase());
        expect(html, `"${name}" must not appear in the markup`).not.toContain(name.toLowerCase());
      }
    });
  });

  describe('engineering decisions (REQ-HOME-105)', () => {
    it('REQ-HOME-105 each decision shows title, choice, rejected option, reason, cost and evidence links', async () => {
      const { content } = await setup();
      const ui = { ...content.site.ui, ...homeContent.ui };
      const section = region(homeContent.sections['decisions']);

      expect(decisions.length).toBeGreaterThan(0);
      for (const d of decisions) {
        const heading = within(section).getByRole('heading', { name: d.title });
        const item = heading.closest('li, article') as HTMLElement;
        expect(item, `${d.title} sits in its own list item or article`).not.toBeNull();
        const text = norm(item.textContent);

        for (const [label, value] of [
          [ui['chosen'], d.choice],
          [ui['rejected'], d.rejected],
          [ui['reason'], d.reason],
          [ui['cost'], d.cost],
        ]) {
          expect(text, `${d.title}: label ${label}`).toContain(label);
          expect(text, `${d.title}: ${label} text`).toContain(norm(value));
        }
        expect(text).toContain(ui['evidence']);
        for (const e of d.evidence) {
          const link = within(item).getByRole('link', { name: e.label });
          if (e.url) expect(link.getAttribute('href')).toBe(e.url);
          else expect(link.getAttribute('href')).toBeTruthy();
        }
      }
      expect(norm(section.textContent)).toContain(homeContent.sections['decisionsIntro']);
    });

    it('REQ-HOME-105 decisions appear in content order, each once', async () => {
      await setup();
      const section = region(homeContent.sections['decisions']);
      const titles = within(section)
        .getAllByRole('heading', { level: 3 })
        .map((h) => norm(h.textContent));

      expect(titles).toEqual(decisions.map((d) => d.title));
    });
  });

  describe('capabilities (REQ-HOME-104)', () => {
    it('REQ-HOME-104 capabilities are grouped, and every skill points to its evidence', async () => {
      const { content } = await setup();
      const section = region(homeContent.sections['capabilities']);

      expect(content.skills.length).toBeGreaterThan(0);
      for (const group of content.skills) {
        expect(within(section).getByRole('heading', { name: group.label })).toBeTruthy();
        const box = within(section).getByRole('heading', { name: group.label }).parentElement!;
        for (const skill of group.skills) {
          const item = within(box)
            .getAllByRole('listitem')
            .find((li) => norm(li.textContent).includes(skill.name));
          expect(item, `${group.label} / ${skill.name}`).toBeDefined();
          const links = within(item!)
            .getAllByRole('link')
            .map((a) => a.getAttribute('href') ?? '');
          for (const id of skill.evidence) {
            if (content.project(id)) {
              expect(links).toContain(`/projects/${id}`);
            } else if (content.experience.some((r) => r.id === id)) {
              expect(links.some((h) => h.startsWith('/experience'))).toBe(true);
            }
          }
        }
      }
    });
  });

  describe('markup rules', () => {
    it('REQ-SEC-101 the rendered Home has no inline style attribute', async () => {
      const { container } = await setup();

      expect(container.querySelectorAll('[style]')).toHaveLength(0);
    });
  });
});
