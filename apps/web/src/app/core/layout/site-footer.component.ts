import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ContentService } from '../content/content.service';

/** Site footer (REQ-UI-001): note, public links and the source link, all from content/. */
@Component({
  selector: 'sf-site-footer',
  templateUrl: './site-footer.component.html',
  styleUrl: './site-footer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteFooterComponent {
  private readonly content = inject(ContentService);

  protected readonly profile = this.content.profile;
  protected readonly footer = this.content.site.footer;
  protected readonly year = new Date().getFullYear();
}
