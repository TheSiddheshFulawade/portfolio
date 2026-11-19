import { render, screen } from '@testing-library/angular';
import { SiteFooterComponent } from './site-footer.component';

describe('SiteFooterComponent', () => {
  it('REQ-UI-001 shows the footer note, public links and the source link from content', async () => {
    await render(SiteFooterComponent);

    expect(screen.getByRole('contentinfo')).toBeTruthy();
    expect(screen.getByText(/Built with Angular, prerendered/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'GitHub' }).getAttribute('href')).toBe(
      'https://github.com/TheSiddheshFulawade',
    );
    expect(screen.getByRole('link', { name: 'LinkedIn' })).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'hello@siddheshfulawade.com' }).getAttribute('href'),
    ).toBe('mailto:hello@siddheshfulawade.com');
    expect(screen.getByRole('link', { name: 'Source on GitHub' }).getAttribute('href')).toBe(
      'https://github.com/TheSiddheshFulawade/portfolio',
    );
  });
});
