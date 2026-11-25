import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/seo/seo.service';
import { ContentService } from '../../core/content/content.service';
import { projectBody } from '../../core/content/project-bodies';
import { StatusPillComponent } from '../../shared/ui/status-pill.component';
import { NotFoundPageComponent } from '../not-found/not-found-page.component';

/**
 * One project (REQ-PAGE-004, 005): front matter plus the Markdown write-up, rendered to HTML at build time and
 * passed through Angular's sanitizer via [innerHTML]. Prerendered per slug (app.routes.server.ts).
 */
@Component({
  selector: 'sf-project-page',
  imports: [RouterLink, StatusPillComponent, NotFoundPageComponent],
  templateUrl: './project-page.component.html',
  styleUrl: './project-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectPageComponent {
  private readonly content = inject(ContentService);

  /** Bound from the :slug route parameter (withComponentInputBinding). */
  readonly slug = input('');
  protected readonly project = computed(() => this.content.project(this.slug()));
  protected readonly body = computed(() => projectBody(this.slug()));
  protected readonly ui = this.content.site.ui;

  constructor() {
    const seo = inject(SeoService);
    // An unknown slug renders <sf-not-found-page>, which sets the noindex meta itself.
    effect(() => {
      const project = this.project();
      if (project) {
        seo.item({
          title: `${project.title} · ${this.content.site.title}`,
          description: project.tagline,
          path: `/projects/${project.id}`,
        });
      }
    });
  }
}
