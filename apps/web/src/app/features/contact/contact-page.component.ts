import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SeoService } from '../../core/seo/seo.service';
import { ContentService } from '../../core/content/content.service';

/** Contact (REQ-PAGE-007, 008): site email, public links and the resume. No form in v1. */
@Component({
  selector: 'sf-contact-page',
  templateUrl: './contact-page.component.html',
  styleUrl: './contact-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactPageComponent {
  private readonly content = inject(ContentService);

  protected readonly page = this.content.page('contact');
  protected readonly profile = this.content.profile;
  protected readonly ui = this.content.site.ui;
  /** Public links with a readable address as the link text, e.g. github.com/TheSiddheshFulawade. */
  protected readonly links = this.profile.links.map((link) => ({
    ...link,
    display: link.url.replace(/^https?:\/\/(www\.)?/, ''),
  }));

  constructor() {
    inject(SeoService).page('contact', '/contact');
  }
}
