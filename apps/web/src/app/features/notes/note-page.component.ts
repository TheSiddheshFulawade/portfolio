import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContentService } from '../../core/content/content.service';
import { SeoService } from '../../core/seo/seo.service';
import { formatDay } from '../../shared/format/month';
import { NotFoundPageComponent } from '../not-found/not-found-page.component';

/**
 * One note (REQ-NOTE-001, 002): the Markdown rendered at build time, passed through Angular's sanitizer via
 * [innerHTML]. Prerendered per slug (app.routes.server.ts).
 */
@Component({
  selector: 'sf-note-page',
  imports: [RouterLink, NotFoundPageComponent],
  templateUrl: './note-page.component.html',
  styleUrl: './note-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotePageComponent {
  private readonly content = inject(ContentService);

  /** Bound from the :slug route parameter (withComponentInputBinding). */
  readonly slug = input('');
  protected readonly note = computed(() => this.content.note(this.slug()));
  protected readonly shownDate = computed(() => {
    const note = this.note();
    return note ? formatDay(note.date, this.content.site.locale) : '';
  });
  protected readonly ui = this.content.site.ui;

  constructor() {
    const seo = inject(SeoService);
    // An unknown slug renders <sf-not-found-page>, which sets the noindex meta itself.
    effect(() => {
      const note = this.note();
      if (note) {
        seo.item({
          title: `${note.title} · ${this.content.site.title}`,
          description: note.summary,
          path: `/notes/${note.id}`,
        });
      }
    });
  }
}
