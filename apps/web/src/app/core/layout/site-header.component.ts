import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { ContentService } from '../content/content.service';
import { ThemeService } from '../theme/theme.service';

/** Site header (REQ-UI-001): brand, main navigation that collapses on mobile (REQ-UI-003), theme toggle (REQ-UI-002). */
@Component({
  selector: 'sf-site-header',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './site-header.component.html',
  styleUrl: './site-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Escape anywhere in the document closes the open mobile menu (WCAG 2.2 AA); inert while closed.
  host: { '(document:keydown.escape)': 'onEscape()' },
})
export class SiteHeaderComponent {
  private readonly content = inject(ContentService);
  private readonly themeService = inject(ThemeService);

  protected readonly name = this.content.profile.name;
  protected readonly nav = this.content.site.nav;
  protected readonly ui = this.content.site.ui;
  protected readonly open = signal(false);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly menuButton = viewChild.required<ElementRef<HTMLButtonElement>>('menuButton');

  constructor() {
    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => this.open.set(false));
  }

  protected toggleMenu(): void {
    this.open.update((v) => !v);
  }

  protected closeMenu(): void {
    this.open.set(false);
  }

  /** Close on Escape; return focus to the Menu button only if focus was in the header or on body. */
  protected onEscape(): void {
    if (!this.open()) return;
    const active = document.activeElement;
    const focusInHeaderOrBody =
      !active || active === document.body || this.host.nativeElement.contains(active);
    this.open.set(false);
    if (focusInHeaderOrBody) this.menuButton().nativeElement.focus();
  }

  protected toggleTheme(): void {
    this.themeService.toggle();
  }
}
