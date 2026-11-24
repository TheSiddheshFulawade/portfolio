import { DOCUMENT, inject } from '@angular/core';
import { ActivatedRouteSnapshot, ViewTransitionInfo } from '@angular/router';

/** Path of a router state, without query or fragment. */
function pagePath(root: ActivatedRouteSnapshot): string {
  const segments: string[] = [];
  for (let node: ActivatedRouteSnapshot | null = root; node; node = node.firstChild) {
    segments.push(...node.url.map((s) => s.path));
  }
  return '/' + segments.join('/');
}

/**
 * Route view transitions (REQ-MOT-103). The page swaps at once, with no fade, when the user asks for reduced
 * motion (REQ-MOT-102) or when only the query or fragment changed, so an in-page link does not flash the page.
 */
export function tuneRouteTransition({ transition, from, to }: ViewTransitionInfo): void {
  const reduced = inject(DOCUMENT).defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)');
  if (reduced?.matches || pagePath(from) === pagePath(to)) transition.skipTransition();
}
