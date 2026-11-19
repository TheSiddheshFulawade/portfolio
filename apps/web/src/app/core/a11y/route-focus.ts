import { DOCUMENT, DestroyRef, Injectable, Injector, afterNextRender, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, skip } from 'rxjs';

/**
 * Moves focus to the page's main heading (or the URL fragment's target) after every client-side route
 * change, but not on the first load (REQ-UI-005), so screen reader and keyboard users start at the new content.
 */
@Injectable({ providedIn: 'root' })
export class RouteFocus {
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);

  /** Starts listening; stops when `destroyRef` is destroyed. */
  start(destroyRef: DestroyRef): void {
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        skip(1),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe((e) => {
        const fragment = this.router.parseUrl(e.urlAfterRedirects).fragment;
        afterNextRender({ read: () => this.focusTarget(fragment) }, { injector: this.injector });
      });
  }

  /**
   * Focuses the element named by the URL fragment (e.g. /experience#2024-11-rebit), else the main heading,
   * else <main> itself.
   */
  focusTarget(fragment?: string | null): void {
    const main = this.document.getElementById('main');
    const target =
      (fragment ? this.document.getElementById(fragment) : null) ??
      main?.querySelector<HTMLElement>('h1') ??
      main;
    if (!target) return;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: !fragment });
  }
}
