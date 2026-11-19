import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContentService } from '../../core/content/content.service';
import { SeoService } from '../../core/seo/seo.service';
import { formatDay } from '../../shared/format/month';

/** Notes (REQ-NOTE-001): published notes, newest first, from content/notes. */
@Component({
  selector: 'sf-notes-page',
  imports: [RouterLink],
  templateUrl: './notes-page.component.html',
  styleUrl: './notes-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotesPageComponent {
  private readonly content = inject(ContentService);

  protected readonly page = this.content.page('notes');
  protected readonly ui = this.content.site.ui;
  protected readonly notes = this.content.notes.map((note) => ({
    ...note,
    shownDate: formatDay(note.date, this.content.site.locale),
  }));

  constructor() {
    inject(SeoService).page('notes', '/notes');
  }
}
