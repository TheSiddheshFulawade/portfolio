import { ChangeDetectionStrategy, Component, DOCUMENT, DestroyRef, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { RouteFocus } from './core/a11y/route-focus';
import { ContentService } from './core/content/content.service';
import { SiteFooterComponent } from './core/layout/site-footer.component';
import { SiteHeaderComponent } from './core/layout/site-header.component';

/** App shell (REQ-UI-001): skip link, header, one <main> for the routed page, footer. */
@Component({
  imports: [RouterOutlet, SiteHeaderComponent, SiteFooterComponent],
  selector: 'sf-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private readonly document = inject(DOCUMENT);
  protected readonly ui = inject(ContentService).site.ui;

  constructor() {
    inject(RouteFocus).start(inject(DestroyRef));
  }

  /** The base href would turn "#main" into a link to the home page, so focus <main> directly. */
  protected skipToMain(event: Event): void {
    event.preventDefault();
    this.document.getElementById('main')?.focus();
  }
}
