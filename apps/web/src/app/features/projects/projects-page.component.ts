import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/seo/seo.service';
import { ContentService } from '../../core/content/content.service';
import { labContent } from '../../core/content/lab-content';
import { SagaBoardComponent } from './saga-board/saga-board.component';
import { SettlementBoardComponent } from './settlement-board/settlement-board.component';
import { SettlementResultsComponent } from './settlement-board/settlement-results.component';
import { StatusPillComponent } from '../../shared/ui/status-pill.component';

/**
 * Projects (REQ-PAGE-004, REQ-PROJ-101): current projects as cards, Settlement Lab's simulation and measured results,
 * then earlier work. The board and its model load in a deferred chunk, out of the initial bundle (REQ-PERF-101).
 */
@Component({
  selector: 'sf-projects-page',
  imports: [
    RouterLink,
    StatusPillComponent,
    SagaBoardComponent,
    SettlementBoardComponent,
    SettlementResultsComponent,
  ],
  templateUrl: './projects-page.component.html',
  styleUrl: './projects-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectsPageComponent {
  private readonly content = inject(ContentService);

  protected readonly page = this.content.page('projects');
  protected readonly lab = labContent.board;
  protected readonly ui = this.content.site.ui;
  protected readonly current = this.content.currentProjects;
  protected readonly earlier = this.content.earlierProjects;

  constructor() {
    inject(SeoService).page('projects', '/projects');
  }
}
