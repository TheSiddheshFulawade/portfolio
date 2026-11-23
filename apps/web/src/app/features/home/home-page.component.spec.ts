import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { fireEvent, render, screen, within } from '@testing-library/angular';
import { ContentService } from '../../core/content/content.service';
import { HomePageComponent } from './home-page.component';

/** Real content with the profile resume replaced (REQ-PAGE-008: it is optional). */
function contentWith(resume: { label: string; url: string } | undefined) {
  return {
    provide: ContentService,
    useFactory: () => {
      const real = new ContentService();
      return Object.assign(real, {
        profile: { ...real.profile, resume },
      }) as unknown as ContentService;
    },
  };
}

async function setup() {
  await render(HomePageComponent, { providers: [provideRouter([])] });
  return TestBed.inject(ContentService);
}

describe('HomePageComponent', () => {
  it('REQ-PAGE-002 shows name, headline and summary from content/profile.yaml', async () => {
    const content = await setup();

    expect(screen.queryAllByRole('main')).toHaveLength(0); // the app shell owns <main>
    expect(screen.getByRole('heading', { level: 1 }).textContent?.trim()).toBe('Siddhesh Fulawade');
    expect(screen.getByText(content.profile.headline)).toBeTruthy();
    expect(screen.getByText(content.profile.summary.trim())).toBeTruthy();
  });

  it('REQ-PAGE-008 links to the resume when the profile has one', async () => {
    await render(HomePageComponent, {
      providers: [provideRouter([]), contentWith({ label: 'Resume (PDF)', url: '/resume.pdf' })],
    });

    expect(screen.getByRole('link', { name: 'Resume (PDF)' }).getAttribute('href')).toBe(
      '/resume.pdf',
    );
  });

  it('REQ-PAGE-008 shows no resume link when the profile has none, and still links to contact', async () => {
    const { container } = await render(HomePageComponent, {
      providers: [provideRouter([]), contentWith(undefined)],
    });

    expect(screen.queryByRole('link', { name: /resume/i })).toBeNull();
    expect(container.querySelector('a[href*="resume.pdf"]')).toBeNull();
    expect(screen.getByRole('link', { name: 'Get in touch' })).toBeTruthy();
  });

  it('REQ-PAGE-002 links to the contact page', async () => {
    await setup();

    expect(screen.getByRole('link', { name: 'Get in touch' }).getAttribute('href')).toBe(
      '/contact',
    );
  });

  it('REQ-PAGE-002 REQ-CONTENT-005 shows every metric, each with its source on focus', async () => {
    const content = await setup();
    const list = screen.getByRole('list', { name: 'Track record' });
    const items = within(list).getAllByRole('listitem');

    expect(items).toHaveLength(content.metrics.length);
    content.metrics.forEach((metric, i) => {
      const item = items[i];
      expect(item.textContent).toContain(metric.value);
      expect(item.textContent).toContain(metric.label);
      const focusable = within(item).getByText(metric.value).closest('[tabindex="0"]');
      expect(focusable).not.toBeNull();
      const tooltip = document.getElementById(focusable!.getAttribute('aria-describedby')!);
      expect(tooltip?.getAttribute('role')).toBe('tooltip');
      expect(tooltip?.textContent).toContain(metric.source);
    });
  });

  it('REQ-PAGE-002 Escape dismisses a metric source tooltip (WCAG 1.4.13)', async () => {
    const content = await setup();
    const value = screen
      .getByText(content.metrics[0].value)
      .closest<HTMLElement>('[tabindex="0"]')!;

    fireEvent.focus(value);
    fireEvent.keyDown(value, { key: 'Escape' });

    expect(value.getAttribute('data-dismissed')).toBe('true');
    fireEvent.blur(value);
    expect(value.getAttribute('data-dismissed')).toBeNull();
  });

  it('REQ-PAGE-002 lists featured projects only, each linking to its page', async () => {
    const content = await setup();
    const section = screen.getByRole('region', { name: 'Featured work' });
    const headings = within(section).getAllByRole('heading', { level: 3 });

    expect(headings.map((h) => h.textContent?.trim())).toEqual(
      content.featuredProjects.map((p) => p.title),
    );
    for (const project of content.featuredProjects) {
      expect(within(section).getByRole('link', { name: project.title }).getAttribute('href')).toBe(
        `/projects/${project.id}`,
      );
      expect(within(section).getByText(project.tagline)).toBeTruthy();
    }
    expect(within(section).getByRole('link', { name: 'All projects' }).getAttribute('href')).toBe(
      '/projects',
    );
  });
});
