import { ChangeDetectionStrategy, Component, DOCUMENT, DestroyRef, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { RouteFocus } from './core/a11y/route-focus';
import { ContentService } from './core/content/content.service';
import { SiteFooterComponent } from './core/layout/site-footer.component';
import { SiteHeaderComponent } from './core/layout/site-header.component';
import { ContactSectionComponent } from './shared/ui/contact-section.component';

/**
 * App shell (REQ-UI-001, 101, 102): skip link, header, one <main> for the routed page, the closing contact
 * section (not on pages that are about contact or an error, which keep one h1 and no repeat), footer.
 */
@Component({
  imports: [RouterOutlet, SiteHeaderComponent, SiteFooterComponent, ContactSectionComponent],
  selector: 'sf-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  protected readonly ui = inject(ContentService).site.ui;

  /** Routes set `data.closing = false` when they already end the page their own way. */
  protected readonly closing = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.showsClosing()),
    ),
    { initialValue: this.showsClosing() },
  );

  constructor() {
    inject(RouteFocus).start(inject(DestroyRef));
  }

  private showsClosing(): boolean {
    let route = this.router.routerState.snapshot.root;
    while (route.firstChild) route = route.firstChild;
    return route.data['closing'] !== false;
  }

  /** The base href would turn "#main" into a link to the home page, so focus <main> directly. */
  protected skipToMain(event: Event): void {
    event.preventDefault();
    this.document.getElementById('main')?.focus();
  }
}
