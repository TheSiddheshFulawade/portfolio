import { Router, provideRouter } from '@angular/router';
import { fireEvent, render, screen } from '@testing-library/angular';
import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { routes } from './app.routes';

async function setup() {
  const view = await render(AppComponent, { providers: [provideRouter(routes)] });
  const router = TestBed.inject(Router);
  await router.navigateByUrl('/');
  await view.fixture.whenStable();
  return { view, router };
}

describe('AppComponent shell', () => {
  it('REQ-UI-001 has a skip link, a header, one main landmark and a footer', async () => {
    await setup();

    expect(screen.getByRole('link', { name: 'Skip to main content' })).toBeTruthy();
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('contentinfo')).toBeTruthy();
  });

  it('REQ-UI-005 the skip link moves focus to the main content', async () => {
    await setup();

    fireEvent.click(screen.getByRole('link', { name: 'Skip to main content' }));

    expect(document.activeElement).toBe(screen.getByRole('main'));
  });

  it('REQ-UI-005 focus moves to the main heading after a route change, not on first load', async () => {
    const { view, router } = await setup();
    expect(document.activeElement).not.toBe(screen.getByRole('heading', { level: 1 }));

    await router.navigateByUrl('/does-not-exist');
    await view.fixture.whenStable();

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent?.trim()).toBe('Page not found');
    expect(document.activeElement).toBe(heading);
  });
});
