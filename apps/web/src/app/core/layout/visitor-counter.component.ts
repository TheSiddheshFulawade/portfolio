import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ContentService } from '../content/content.service';

interface Totals {
  total: number;
  today: number;
}

/**
 * Footer visitor counter (REQ-COUNT-001, 005). Counts this page load once (the endpoint keeps one count per
 * visitor per day) and shows the totals in monospace. Uses fetch so HttpClient stays out of the bundle, and waits
 * for browser idle time so it never competes with the page's first paint. (@defer would add about 2.4 KB of
 * runtime to the initial bundle for a 0.6 KB component.) On any failure it renders nothing.
 */
@Component({
  selector: 'sf-visitor-counter',
  template: `@if (totals(); as t) {
    <span class="visually-hidden">{{ ui['counterLabel'] }}:</span>
    <span class="mono"
      >{{ ui['counterTotal'] }} {{ format(t.total) }} · {{ ui['counterToday'] }}
      {{ format(t.today) }}</span
    >
  }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VisitorCounterComponent {
  protected readonly ui = inject(ContentService).site.ui;
  protected readonly totals = signal<Totals | null>(null);
  private readonly numbers = new Intl.NumberFormat('en');

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    afterNextRender(() => {
      const idle = window.requestIdleCallback ?? ((run: () => void) => setTimeout(run, 1));
      idle(() => void this.load());
    });
  }

  protected format(n: number): string {
    return this.numbers.format(n);
  }

  private async load(): Promise<void> {
    try {
      const response = await fetch('/api/visits', { method: 'POST' });
      if (!response.ok) return;
      const body = (await response.json()) as Partial<Totals>;
      if (Number.isInteger(body.total) && Number.isInteger(body.today)) {
        this.totals.set({ total: body.total as number, today: body.today as number });
      }
    } catch {
      // Counter unavailable: show nothing (REQ-COUNT-005).
    }
  }
}
