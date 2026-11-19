import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContentService } from '../../core/content/content.service';
import { MetricTileComponent } from '../../shared/ui/metric-tile.component';
import { StatusPillComponent } from '../../shared/ui/status-pill.component';

/** Home (REQ-PAGE-002): who, what, sourced metrics, featured work, resume and contact. All copy from content/. */
@Component({
  selector: 'sf-home-page',
  imports: [RouterLink, MetricTileComponent, StatusPillComponent],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePageComponent {
  private readonly content = inject(ContentService);

  protected readonly profile = this.content.profile;
  protected readonly metrics = this.content.metrics;
  protected readonly featured = this.content.featuredProjects;
  protected readonly ui = this.content.site.ui;
}
