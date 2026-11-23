import { render, screen } from '@testing-library/angular';
import { ContentService } from '../../core/content/content.service';
import { ContactPageComponent } from './contact-page.component';

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

describe('ContactPageComponent', () => {
  it('REQ-PAGE-007 shows the site email as a mailto link, LinkedIn and GitHub, and no form', async () => {
    const { container } = await render(ContactPageComponent);

    expect(screen.getByRole('heading', { level: 1 }).textContent?.trim()).toBe('Contact');
    expect(
      screen.getByRole('link', { name: 'hello@siddheshfulawade.com' }).getAttribute('href'),
    ).toBe('mailto:hello@siddheshfulawade.com');
    expect(screen.getByText('LinkedIn')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'linkedin.com/in/siddhesh-fulawade' }).getAttribute('href'),
    ).toBe('https://www.linkedin.com/in/siddhesh-fulawade');
    expect(screen.getByText('GitHub')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'github.com/TheSiddheshFulawade' }).getAttribute('href'),
    ).toBe('https://github.com/TheSiddheshFulawade');
    expect(container.querySelector('form, input, textarea')).toBeNull();
  });

  it('REQ-PAGE-008 links to the resume when the profile has one', async () => {
    await render(ContactPageComponent, {
      providers: [contentWith({ label: 'Resume (PDF)', url: '/resume.pdf' })],
    });

    expect(screen.getByRole('link', { name: 'Resume (PDF)' }).getAttribute('href')).toBe(
      '/resume.pdf',
    );
  });

  it('REQ-PAGE-008 shows no resume link when the profile has none', async () => {
    const { container } = await render(ContactPageComponent, {
      providers: [contentWith(undefined)],
    });

    expect(screen.queryByRole('link', { name: /resume/i })).toBeNull();
    expect(container.querySelector('a[href*="resume.pdf"]')).toBeNull();
  });
});
