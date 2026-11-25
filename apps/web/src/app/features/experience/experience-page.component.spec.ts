import { TestBed } from '@angular/core/testing';
import { render, screen, within } from '@testing-library/angular';
import { ContentService } from '../../core/content/content.service';
import { ExperiencePageComponent } from './experience-page.component';

async function setup() {
  await render(ExperiencePageComponent);
  return TestBed.inject(ContentService);
}

describe('ExperiencePageComponent', () => {
  it('REQ-PAGE-003 has the page heading from content/site.yaml', async () => {
    await setup();

    expect(screen.getByRole('heading', { level: 1 }).textContent?.trim()).toBe('Experience');
  });

  it('REQ-PAGE-003 lists every role newest first', async () => {
    const content = await setup();
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent?.trim());
    const newestFirst = [...content.experience].sort((a, b) => b.start.localeCompare(a.start));

    expect(titles).toEqual(newestFirst.map((r) => r.title));
  });

  it('REQ-PAGE-003 each role shows company, dates in one format, location and impact bullets', async () => {
    const content = await setup();
    const articles = screen.getAllByRole('article');

    for (const role of content.experience) {
      const article = articles.find((a) => a.textContent?.includes(role.company))!;
      const text = article.textContent ?? '';
      expect(text).toContain(role.title);
      expect(text).toContain(role.location);
      expect(text).toMatch(/[A-Z][a-z]{2} \d{4} – ([A-Z][a-z]{2} \d{4}|Present)/);
      const time = article.querySelector('time');
      expect(time?.getAttribute('datetime')).toBe(role.start);
      for (const group of role.highlights) {
        expect(within(article).getByRole('heading', { level: 3, name: group.theme })).toBeTruthy();
        for (const item of group.items) expect(within(article).getByText(item)).toBeTruthy();
      }
    }
  });

  it('REQ-PAGE-003 the current role is marked Present', async () => {
    const content = await setup();
    const current = content.experience.find((r) => r.end === null)!;
    const article = screen
      .getAllByRole('article')
      .find((a) => a.textContent?.includes(current.company))!;

    expect(article.textContent).toContain('– Present');
  });
});
