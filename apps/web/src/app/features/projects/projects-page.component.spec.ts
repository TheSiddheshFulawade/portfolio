import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import { ContentService } from '../../core/content/content.service';
import { ProjectsPageComponent } from './projects-page.component';

async function setup() {
  await render(ProjectsPageComponent, { providers: [provideRouter([])] });
  return TestBed.inject(ContentService);
}

describe('ProjectsPageComponent', () => {
  it('REQ-PAGE-004 has the page heading from content/site.yaml', async () => {
    await setup();

    expect(screen.getByRole('heading', { level: 1 }).textContent?.trim()).toBe('Projects');
  });

  it('REQ-PAGE-004 REQ-CONTENT-004 lists current projects in content order, each linking to its page', async () => {
    const content = await setup();
    const current = screen.getByRole('list', { name: 'Projects' });
    const titles = within(current)
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent?.trim());

    expect(titles).toEqual(content.currentProjects.map((p) => p.title));
    for (const project of content.currentProjects) {
      expect(within(current).getByRole('link', { name: project.title }).getAttribute('href')).toBe(
        `/projects/${project.id}`,
      );
      expect(within(current).getByText(project.tagline)).toBeTruthy();
    }
  });

  it('REQ-PAGE-004 shows earlier work in its own section, linking to detail pages only', async () => {
    const content = await setup();
    const section = screen.getByRole('region', { name: 'Earlier work' });
    const links = within(section).getAllByRole('link');

    expect(links.map((a) => a.getAttribute('href'))).toEqual(
      content.earlierProjects.map((p) => `/projects/${p.id}`),
    );
  });
});
