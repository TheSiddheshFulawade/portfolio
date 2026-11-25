import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/seo/seo.service';
import { ContentService } from '../../core/content/content.service';
import { resolveSkills } from '../../core/content/evidence';

/**
 * About (REQ-ABOUT-101): photo when set, bio, and capabilities with evidence. A skill without resolvable
 * evidence is hidden. Education lives on Experience (REQ-EXP-101).
 */
@Component({
  selector: 'sf-about-page',
  imports: [RouterLink],
  templateUrl: './about-page.component.html',
  styleUrl: './about-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutPageComponent {
  private readonly content = inject(ContentService);

  protected readonly page = this.content.page('about');
  protected readonly profile = this.content.profile;
  protected readonly ui = this.content.site.ui;
  protected readonly groups = resolveSkills(this.content.skills, this.content);

  constructor() {
    inject(SeoService).page('about', '/about');
  }
}
