import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContentService } from '../content/content.service';
import { VisitorCounterComponent } from './visitor-counter.component';

/** Site footer (REQ-UI-102): identity, site links, systems, profiles, location, note and source, all from content/. */
@Component({
  selector: 'sf-site-footer',
  imports: [RouterLink, VisitorCounterComponent],
  templateUrl: './site-footer.component.html',
  styleUrl: './site-footer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteFooterComponent {
  private readonly content = inject(ContentService);

  protected readonly profile = this.content.profile;
  protected readonly footer = this.content.site.footer;
  protected readonly nav = this.content.site.nav;
  /** Original systems; each links to its own page, so a name has one destination. */
  protected readonly systems = this.content.currentProjects;
}
