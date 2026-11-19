import { DOCUMENT, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type Theme = 'dark' | 'light';
const KEY = 'sf-theme';

/**
 * Light or dark theme (REQ-UI-002). With no saved choice the CSS follows prefers-color-scheme and
 * no data-theme attribute is set. public/theme-init.js applies a saved choice before first paint;
 * this service keeps the signal in sync and handles the toggle.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly current = signal<Theme>(this.initial());

  readonly theme = this.current.asReadonly();

  toggle(): void {
    const next: Theme = this.current() === 'dark' ? 'light' : 'dark';
    this.current.set(next);
    this.document.documentElement.dataset['theme'] = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Storage blocked: the choice lasts for this page view only.
    }
  }

  private initial(): Theme {
    if (!this.browser) return 'dark';
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {
      // Storage blocked: fall back to the system preference.
    }
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
}
