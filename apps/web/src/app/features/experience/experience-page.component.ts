import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ContentService } from '../../core/content/content.service';
import { formatMonthRange } from '../../shared/format/month';

/** Experience (REQ-PAGE-003): roles in content order (newest first), with dates, location and impact bullets. */
@Component({
  selector: 'sf-experience-page',
  templateUrl: './experience-page.component.html',
  styleUrl: './experience-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExperiencePageComponent {
  private readonly content = inject(ContentService);

  protected readonly page = this.content.page('experience');
  protected readonly ui = this.content.site.ui;
  protected readonly roles = this.content.experience.map((role) => ({
    ...role,
    dates: formatMonthRange(role.start, role.end, this.ui['present'], this.content.site.locale),
  }));
}
