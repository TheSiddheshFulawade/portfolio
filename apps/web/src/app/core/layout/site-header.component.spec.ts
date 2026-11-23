import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { fireEvent, render, screen, within } from '@testing-library/angular';
import { ContentService } from '../content/content.service';
import { ThemeService } from '../theme/theme.service';
import { SiteHeaderComponent } from './site-header.component';

// jsdom matches no min-width media query, so the nav is in its collapsed (mobile) state: query hidden nodes.
async function setup(url = '/') {
  const view = await render(SiteHeaderComponent, {
    providers: [provideRouter([{ path: '**', children: [] }])],
  });
  await view.navigate(url);
  return view;
}

describe('SiteHeaderComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['theme'];
  });

  it('REQ-UI-001 shows the brand and every nav item from content/site.yaml', async () => {
    await setup();

    const nav = screen.getByRole('navigation', { hidden: true });
    const labels = within(nav)
      .getAllByRole('link', { hidden: true })
      .map((a) => a.textContent?.trim());

    expect(nav.getAttribute('aria-label')).toBe('Main');
    // Notes is in the navigation only while at least one note is published (REQ-NOTE-002).
    const notes = TestBed.inject(ContentService).notes.length > 0 ? ['Notes'] : [];
    expect(labels).toEqual(['Home', 'Experience', 'Projects', ...notes, 'About', 'Contact']);
    expect(screen.getByRole('link', { name: 'Siddhesh Fulawade' }).getAttribute('href')).toBe('/');
  });

  it('REQ-UI-005 marks the current page link with aria-current', async () => {
    await setup('/experience');

    const nav = screen.getByRole('navigation', { hidden: true });

    expect(within(nav).getByText('Experience').getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByText('Home').getAttribute('aria-current')).toBeNull();
  });

  it('REQ-UI-003 the menu button opens and closes the navigation', async () => {
    await setup();
    const button = screen.getByRole('button', { name: 'Menu' });

    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(button, { key: 'Escape' });

    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  describe('REQ-UI-003 Escape while the menu is open (WCAG 2.2 AA)', () => {
    afterEach(() => document.getElementById('outside-input')?.remove());

    function addOutsideInput(): HTMLInputElement {
      const input = document.createElement('input');
      input.id = 'outside-input';
      document.body.appendChild(input);
      return input;
    }

    it('closes the menu and focuses the Menu button when Escape is pressed on the body', async () => {
      await setup();
      const button = screen.getByRole('button', { name: 'Menu' });
      fireEvent.click(button);
      (document.activeElement as HTMLElement | null)?.blur();

      fireEvent.keyDown(document.body, { key: 'Escape' });

      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(button);
    });

    it('closes the menu and returns focus to the button when Escape is pressed on a nav link', async () => {
      await setup();
      const button = screen.getByRole('button', { name: 'Menu' });
      fireEvent.click(button);
      const link = within(screen.getByRole('navigation', { hidden: true })).getByText('Projects');
      link.focus();

      fireEvent.keyDown(link, { key: 'Escape' });

      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(button);
    });

    it('closes the menu on Escape outside the header without stealing focus', async () => {
      await setup();
      const button = screen.getByRole('button', { name: 'Menu' });
      fireEvent.click(button);
      const input = addOutsideInput();
      input.focus();

      fireEvent.keyDown(input, { key: 'Escape' });

      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(input);
    });

    it('does nothing when the menu is closed (no focus move, no state change)', async () => {
      await setup();
      const button = screen.getByRole('button', { name: 'Menu' });
      const input = addOutsideInput();
      input.focus();

      fireEvent.keyDown(input, { key: 'Escape' });
      fireEvent.keyDown(document.body, { key: 'Escape' });

      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(input);
    });
  });

  it('REQ-UI-003 following a nav link closes the menu', async () => {
    const view = await setup();
    const button = screen.getByRole('button', { name: 'Menu' });
    fireEvent.click(button);

    await view.navigate('/projects');

    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('REQ-UI-002 the theme toggle switches the theme', async () => {
    await setup();
    const theme = TestBed.inject(ThemeService);
    const before = theme.theme();

    fireEvent.click(screen.getByRole('button', { name: 'Switch colour theme' }));

    expect(theme.theme()).not.toBe(before);
    expect(document.documentElement.dataset['theme']).toBe(theme.theme());
  });
});
