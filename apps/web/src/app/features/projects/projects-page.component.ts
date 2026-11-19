import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContentService } from '../../core/content/content.service';
import { StatusPillComponent } from '../../shared/ui/status-pill.component';

/** Projects (REQ-PAGE-004): current projects as cards, then earlier work, in content order. */
@Component({
  selector: 'sf-projects-page',
  imports: [RouterLink, StatusPillComponent],
  templateUrl: './projects-page.component.html',
  styleUrl: './projects-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectsPageComponent {
  private readonly content = inject(ContentService);

  protected readonly page = this.content.page('projects');
  protected readonly ui = this.content.site.ui;
  protected readonly current = this.content.currentProjects;
  protected readonly earlier = this.content.earlierProjects;
}
