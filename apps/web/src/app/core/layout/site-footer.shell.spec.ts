import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import { ContentService } from '../content/content.service';
import { SiteFooterComponent } from './site-footer.component';

// Shape added to content/site.yaml by RD-04 (the generated types follow with the component work).
interface FooterContent {
  identity: string;
  copyrightYear: number;
  navLabel: string;
  siteHeading: string;
  systemsHeading: string;
  profilesHeading: string;
  note: string;
  sourceLabel: string;
  sourceUrl: string;
}

const content = new ContentService();
const footer = content.site.footer as unknown as FooterContent;
const profile = content.profile;

async function setup() {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  const view = await render(SiteFooterComponent, { providers: [provideRouter([])] });
  return view;
}

/**
 * Assumed markup: each group is an element holding an <h2> (the group name) and its links, so the h2's
 * parent is the group.
 */
function group(name: string): HTMLElement {
  return screen.getByRole('heading', { level: 2, name }).parentElement as HTMLElement;
}

describe('SiteFooterComponent (spec 005 RD-04)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('REQ-UI-102 shows the identity: name and the one-line description from content', async () => {
    await setup();
    const info = screen.getByRole('contentinfo');

    expect(within(info).getByText(profile.name, { selector: 'strong' })).toBeTruthy();
    expect(within(info).getByText(footer.identity)).toBeTruthy();
  });

  it('REQ-UI-102 lists the site links in a navigation named from content, matching the header nav', async () => {
    await setup();

    const nav = screen.getByRole('navigation', { name: footer.navLabel });
    const links = within(nav).getAllByRole('link');

    expect(within(group(footer.siteHeading)).getAllByRole('link')).toHaveLength(links.length);
    expect(links.map((a) => [a.textContent?.trim(), a.getAttribute('href')])).toEqual(
      content.site.nav.map((item) => [item.label, item.path]),
    );
  });

  it('REQ-UI-102 lists every current project under Systems, linking to its own page', async () => {
    await setup();
    const current = content.projects.filter((p) => !p.earlier);

    const systems = group(footer.systemsHeading);

    expect(current.length).toBeGreaterThan(0);
    for (const project of current) {
      expect(within(systems).getByRole('link', { name: project.title }).getAttribute('href')).toBe(
        `/projects/${project.id}`,
      );
    }
  });

  it('REQ-UI-102 does not list earlier work under Systems', async () => {
    await setup();
    const systems = group(footer.systemsHeading);

    for (const project of content.projects.filter((p) => p.earlier)) {
      expect(within(systems).queryByText(project.title)).toBeNull();
    }
  });

  it('REQ-UI-102 lists the public profiles and the site email under the profiles heading', async () => {
    await setup();
    const profiles = group(footer.profilesHeading);

    for (const link of profile.links) {
      expect(within(profiles).getByRole('link', { name: link.label }).getAttribute('href')).toBe(
        link.url,
      );
    }
    expect(within(profiles).getByRole('link', { name: profile.email }).getAttribute('href')).toBe(
      `mailto:${profile.email}`,
    );
  });

  it('REQ-UI-102 shows the location from the profile', async () => {
    await setup();

    expect(within(screen.getByRole('contentinfo')).getByText(profile.location)).toBeTruthy();
  });

  it('REQ-UI-102 the copyright year comes from content, not the clock', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2041-06-01T00:00:00Z'));
    await setup();
    const info = screen.getByRole('contentinfo');

    expect(within(info).getByText(`© ${footer.copyrightYear} ${profile.name}`)).toBeTruthy();
    expect(info.textContent).not.toContain('2041');
  });

  it('REQ-UI-102 shows the build note and a single source link', async () => {
    await setup();
    const info = screen.getByRole('contentinfo');

    expect(within(info).getByText(footer.note)).toBeTruthy();
    const source = within(info).getAllByRole('link', { name: footer.sourceLabel });
    expect(source).toHaveLength(1);
    expect(source[0].getAttribute('href')).toBe(footer.sourceUrl);
  });

  it('REQ-UI-102 keeps the visitor counter slot inside the footer', async () => {
    const { container } = await setup();

    expect(container.querySelectorAll('footer sf-visitor-counter')).toHaveLength(1);
  });

  it('REQ-UI-102 each group has an h2 and the footer adds no h1', async () => {
    await setup();

    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent?.trim())).toEqual([
      footer.siteHeading,
      footer.systemsHeading,
      footer.profilesHeading,
    ]);
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('REQ-SEC-101 REQ-A11Y-101 uses no style attribute, and external links keep rel noopener', async () => {
    const { container } = await setup();

    expect(container.querySelectorAll('[style]')).toHaveLength(0);
    for (const a of container.querySelectorAll<HTMLAnchorElement>('a[href^="http"]')) {
      expect(a.getAttribute('rel'), a.href).toContain('noopener');
    }
  });
});
