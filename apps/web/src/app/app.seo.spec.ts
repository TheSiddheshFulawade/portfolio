import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';

async function titleAndCanonical(url: string) {
  TestBed.configureTestingModule({
    providers: [provideRouter(routes, withComponentInputBinding())],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  const link = TestBed.inject(DOCUMENT).head.querySelector('link[rel="canonical"]');
  return { title: TestBed.inject(Title).getTitle(), canonical: link?.getAttribute('href') };
}

describe('per-route SEO (REQ-SEO-001)', () => {
  const cases: [string, string, string | undefined][] = [
    [
      '/',
      'Siddhesh Fulawade · Full stack Java engineer, payments',
      'https://siddheshfulawade.com/',
    ],
    ['/experience', 'Experience · Siddhesh Fulawade', 'https://siddheshfulawade.com/experience/'],
    ['/projects', 'Projects · Siddhesh Fulawade', 'https://siddheshfulawade.com/projects/'],
    [
      '/projects/settlement-lab',
      'Settlement Lab · Siddhesh Fulawade',
      'https://siddheshfulawade.com/projects/settlement-lab/',
    ],
    ['/about', 'About · Siddhesh Fulawade', 'https://siddheshfulawade.com/about/'],
    ['/contact', 'Contact · Siddhesh Fulawade', 'https://siddheshfulawade.com/contact/'],
    ['/no-such-page', 'Page not found · Siddhesh Fulawade', undefined],
    ['/projects/no-such-project', 'Page not found · Siddhesh Fulawade', undefined],
  ];

  for (const [url, title, canonical] of cases) {
    it(`REQ-SEO-001 ${url} sets its title and canonical URL from content`, async () => {
      const result = await titleAndCanonical(url);

      expect(result.title).toBe(title);
      expect(result.canonical).toBe(canonical);
    });
  }

  afterEach(() => TestBed.inject(DOCUMENT).head.querySelector('link[rel="canonical"]')?.remove());
});
