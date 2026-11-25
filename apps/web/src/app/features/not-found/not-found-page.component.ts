import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/seo/seo.service';
import { ContentService } from '../../core/content/content.service';
import { ThemeService } from '../../core/theme/theme.service';
import { DotField } from '../../shared/canvas/dot-field';

/** 404 page (REQ-PAGE-001, REQ-UI-104). Prerendered at /404 and copied to 404.html for the host. */
@Component({
  selector: 'sf-not-found-page',
  imports: [RouterLink],
  templateUrl: './not-found-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundPageComponent {
  protected readonly page = inject(ContentService).page('notFound');
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('field');
  private field?: DotField;

  constructor() {
    inject(SeoService).notFound();
    const theme = inject(ThemeService).theme;

    // Decorative "404" in dots, drawn once the canvas has a size; browser only.
    afterNextRender(() => {
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.field = new DotField(this.canvas().nativeElement, '404', still);
    });
    // The theme change is applied to the page before this runs, so the tokens read back are the new ones.
    effect(() => {
      theme();
      this.field?.refreshColours();
    });
    inject(DestroyRef).onDestroy(() => this.field?.destroy());
  }
}
