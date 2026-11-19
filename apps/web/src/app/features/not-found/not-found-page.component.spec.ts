import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { NotFoundPageComponent } from './not-found-page.component';

describe('NotFoundPageComponent', () => {
  it('REQ-PAGE-001 shows the 404 copy from content and a link home', async () => {
    await render(NotFoundPageComponent, { providers: [provideRouter([])] });

    expect(screen.getByRole('heading', { level: 1 }).textContent?.trim()).toBe('Page not found');
    expect(screen.getByText('The page you asked for does not exist or has moved.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to the home page' }).getAttribute('href')).toBe(
      '/',
    );
  });
});
