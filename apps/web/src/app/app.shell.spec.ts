import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { AppComponent } from './app.component';
import { appConfig } from './app.config';
import { ContentService } from './core/content/content.service';

// REQ-UI-101, REQ-UI-102: the shell puts the closing contact section and the footer on every page.
describe('app shell (spec 005 RD-04)', () => {
  const content = new ContentService();
  const copy = (content.site as unknown as { contact: { heading: string } }).contact;

  async function visit(url: string) {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const { fixture, container } = await render(AppComponent, { providers: appConfig.providers });
    await TestBed.inject(Router).navigateByUrl(url);
    await fixture.whenStable();
    return container as HTMLElement;
  }

  afterEach(() => vi.unstubAllGlobals());

  for (const url of ['/', '/projects', '/experience', '/about', '/contact', '/no-such-page']) {
    it(`REQ-UI-102 ${url} has exactly one footer with the visitor counter slot, after main`, async () => {
      const root = await visit(url);

      expect(screen.getAllByRole('contentinfo')).toHaveLength(1);
      const footer = root.querySelector('footer')!;
      expect(footer.querySelector('sf-visitor-counter')).not.toBeNull();
      expect(
        root.querySelector('main')!.compareDocumentPosition(footer) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(root.querySelectorAll('h1')).toHaveLength(1);
    });
  }

  for (const url of ['/', '/projects', '/about']) {
    it(`REQ-UI-101 ${url} ends with the contact section above the footer`, async () => {
      const root = await visit(url);

      const section = screen.getByRole('region', { name: copy.heading });
      expect(section.closest('footer')).toBeNull();
      expect(
        section.compareDocumentPosition(root.querySelector('footer')!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  }
});
