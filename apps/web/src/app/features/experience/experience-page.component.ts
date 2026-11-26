import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SeoService } from '../../core/seo/seo.service';
import { ContentService } from '../../core/content/content.service';
import { formatMonthRange } from '../../shared/format/month';

/**
 * Experience (REQ-EXP-101): every role in full (label rail plus detail column), then education, certifications
 * and achievements. Role ids stay as anchors for evidence links.
 */
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
  protected readonly education = this.content.education;
  protected readonly roles = this.content.experience.map((role) => ({
    ...role,
    dates: formatMonthRange(role.start, role.end, this.ui['present'], this.content.site.locale),
  }));

  constructor() {
    inject(SeoService).page('experience', '/experience');
  }
}
