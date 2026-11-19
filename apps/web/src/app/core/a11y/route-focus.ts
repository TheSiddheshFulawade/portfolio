import { DOCUMENT, DestroyRef, Injectable, Injector, afterNextRender, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, skip } from 'rxjs';

/**
 * Moves focus to the page's main heading after every client-side route change, but not on the first
 * load (REQ-UI-005), so screen reader and keyboard users start at the new content.
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
      .subscribe(() =>
        afterNextRender({ read: () => this.focusHeading() }, { injector: this.injector }),
      );
  }

  /** Focuses the main heading, or <main> itself when the page has no h1. */
  focusHeading(): void {
    const main = this.document.getElementById('main');
    const target = main?.querySelector<HTMLElement>('h1') ?? main;
    if (!target) return;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }
}
