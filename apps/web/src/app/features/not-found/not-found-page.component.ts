import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/seo/seo.service';
import { ContentService } from '../../core/content/content.service';

/** 404 page (REQ-PAGE-001). Prerendered at /404 and copied to 404.html for the host. */
@Component({
  selector: 'sf-not-found-page',
  imports: [RouterLink],
  templateUrl: './not-found-page.component.html',
  styleUrl: './not-found-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundPageComponent {
  protected readonly page = inject(ContentService).page('notFound');

  constructor() {
    inject(SeoService).notFound();
  }
}
