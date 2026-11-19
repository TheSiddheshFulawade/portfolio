import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
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
  // Escape anywhere in the header (menu button or an open nav link) closes the mobile menu.
  host: { '(keydown.escape)': 'closeMenu()' },
})
export class SiteHeaderComponent {
  private readonly content = inject(ContentService);
  private readonly themeService = inject(ThemeService);

  protected readonly name = this.content.profile.name;
  protected readonly nav = this.content.site.nav;
  protected readonly ui = this.content.site.ui;
  protected readonly open = signal(false);

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

  protected toggleTheme(): void {
    this.themeService.toggle();
  }
}
