import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import { ContentService } from '../../core/content/content.service';
import { AboutPageComponent } from './about-page.component';

async function setup() {
  await render(AboutPageComponent, { providers: [provideRouter([])] });
  return TestBed.inject(ContentService);
}

describe('AboutPageComponent', () => {
  it('REQ-PAGE-006 shows the heading and every bio paragraph from content', async () => {
    const content = await setup();

    expect(screen.getByRole('heading', { level: 1 }).textContent?.trim()).toBe('About');
    for (const paragraph of content.profile.bio) {
      expect(screen.getByText(paragraph.trim())).toBeTruthy();
    }
  });

  it('REQ-PAGE-006 groups skills under their group labels', async () => {
    const content = await setup();
    const section = screen.getByRole('region', { name: 'Skills' });

    expect(
      within(section)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent?.trim()),
    ).toEqual(content.skills.map((g) => g.label));
    expect(within(section).getByText('Spring Boot')).toBeTruthy();
  });

  it('REQ-PAGE-006 links project evidence to the project page by title', async () => {
    await setup();
    const section = screen.getByRole('region', { name: 'Skills' });

    const links = within(section).getAllByRole('link', { name: 'Settlement Lab' });

    expect(links.length).toBeGreaterThan(0);
    expect(links[0].getAttribute('href')).toBe('/projects/settlement-lab');
  });

  it('REQ-PAGE-006 labels experience evidence by role and dates, never by company', async () => {
    await setup();
    const section = screen.getByRole('region', { name: 'Skills' });

    const link = within(section).getAllByRole('link', {
      name: 'Full Stack Java Developer, Nov 2024 – Present',
    })[0];

    expect(link.getAttribute('href')).toBe('/experience#2024-11-rebit');
    expect(section.textContent).not.toMatch(/ReBIT|Reserve Bank|Lumu|IIT Bombay/);
  });

  it('REQ-PAGE-006 shows education, certifications and achievements', async () => {
    const content = await setup();
    const section = screen.getByRole('region', { name: 'Education' });
    const degree = content.education.degrees[0];

    expect(within(section).getByText(degree.degree)).toBeTruthy();
    expect(section.textContent).toContain(degree.institution);
    expect(section.textContent).toContain(content.education.certifications[0].name);
    expect(section.textContent).toContain(content.education.achievements[0].text);
  });

  it('REQ-PAGE-008 links to the resume', async () => {
    await setup();

    expect(screen.getByRole('link', { name: 'Resume (PDF)' }).getAttribute('href')).toBe(
      '/resume.pdf',
    );
  });
});
