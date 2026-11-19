import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

function setSystem(dark: boolean) {
  // jsdom has no matchMedia, so stub it as a global.
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: query.includes('dark') ? dark : !dark,
        media: query,
      }) as unknown as MediaQueryList,
  );
}

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['theme'];
  });
  afterEach(() => vi.unstubAllGlobals());

  it('REQ-UI-002 follows the system scheme when nothing is saved', () => {
    setSystem(true);

    const theme = TestBed.inject(ThemeService);

    expect(theme.theme()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBeUndefined();
  });

  it('REQ-UI-002 toggling switches to the other theme, applies it and remembers it', () => {
    setSystem(true);
    const theme = TestBed.inject(ThemeService);

    theme.toggle();

    expect(theme.theme()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(localStorage.getItem('sf-theme')).toBe('light');
  });

  it('REQ-UI-002 a saved choice wins over the system scheme', () => {
    setSystem(false);
    localStorage.setItem('sf-theme', 'dark');

    const theme = TestBed.inject(ThemeService);

    expect(theme.theme()).toBe('dark');
  });
});
