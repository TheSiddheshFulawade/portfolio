import { render, screen } from '@testing-library/angular';
import { ContactPageComponent } from './contact-page.component';

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

  it('REQ-PAGE-008 links to the resume', async () => {
    await render(ContactPageComponent);

    expect(screen.getByRole('link', { name: 'Resume (PDF)' }).getAttribute('href')).toBe(
      '/resume.pdf',
    );
  });
});
