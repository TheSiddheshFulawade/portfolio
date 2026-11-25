import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import { ContentService } from '../content/content.service';
import { SiteHeaderComponent } from './site-header.component';

// Stickiness is CSS and is checked in the browser (e2e/smoke.spec.ts). Behaviour of the menu is in
// site-header.component.spec.ts and stays as it is.
describe('SiteHeaderComponent (spec 005 RD-04)', () => {
  const content = new ContentService();

  async function setup() {
    return render(SiteHeaderComponent, { providers: [provideRouter([])] });
  }

  it('REQ-UI-101 is the page banner and links every separate page from content/site.yaml', async () => {
    await setup();

    const banner = screen.getByRole('banner');
    const nav = within(banner).getByRole('navigation', { hidden: true });
    const hrefs = within(nav)
      .getAllByRole('link', { hidden: true })
      .map((a) => a.getAttribute('href'));

    expect(hrefs).toEqual(content.site.nav.map((n) => n.path));
    for (const page of ['/', '/projects', '/experience', '/about', '/contact']) {
      expect(hrefs).toContain(page);
    }
  });

  it('REQ-UI-101 keeps the theme button and the menu button inside the banner', async () => {
    await setup();
    const banner = screen.getByRole('banner');

    expect(within(banner).getByRole('button', { name: 'Switch colour theme' })).toBeTruthy();
    expect(within(banner).getByRole('button', { name: 'Menu' })).toBeTruthy();
  });

  it('REQ-SEC-101 uses no style attribute in its template', async () => {
    const { container } = await setup();

    expect(container.querySelectorAll('[style]')).toHaveLength(0);
  });
});
