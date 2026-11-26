import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContentService } from '../../core/content/content.service';
import { DecisionEvidence } from '../../core/content/content.types';
import { resolveEvidence, resolveSkills } from '../../core/content/evidence';
import { decisions, homeContent } from '../../core/content/home-content';
import { SeoService } from '../../core/seo/seo.service';
import { headlineFrames } from '../../shared/canvas/headline-cycle';
import { formatMonthRange } from '../../shared/format/month';
import { StatusPillComponent } from '../../shared/ui/status-pill.component';
import { InvariantFieldComponent } from './invariant-field.component';

/** An evidence link under a decision: an external url, or a route of this site. */
interface DecisionLink {
  label: string;
  href?: string;
  link?: string[];
}

/**
 * Home (REQ-HOME-101 to 105, REQ-UI-105): hero with the headline, the technology strip, the invariant field,
 * selected systems, an experience summary without employer names, engineering decisions and capabilities with
 * evidence. All copy comes from content/. Decisions come from the Home-only data (REQ-PERF-101).
 */
@Component({
  selector: 'sf-home-page',
  imports: [RouterLink, StatusPillComponent, InvariantFieldComponent],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'full' },
})
export class HomePageComponent {
  private readonly content = inject(ContentService);
  private readonly view = inject(ChangeDetectorRef);

  protected readonly profile = this.content.profile;
  protected readonly site = this.content.site;
  protected readonly hero = homeContent.hero;
  protected readonly sections = homeContent.sections;
  protected readonly ui = { ...this.content.site.ui, ...homeContent.ui };
  protected readonly featured = this.content.featuredProjects;

  /** Each distinct technology once: the featured systems' stacks first, then the stacks of the roles. */
  protected readonly technologies = [
    ...new Set([
      ...this.featured.flatMap((p) => p.stack),
      ...this.content.experience.flatMap((e) => e.stack),
    ]),
  ];

  /** Roles by title, dates and place only: employer names appear on the Experience page (brief decision 4). */
  protected readonly roles = this.content.experience.map((role) => ({
    id: role.id,
    title: role.title,
    location: role.location,
    summary: role.homeSummary ?? role.summary,
    dates: formatMonthRange(role.start, role.end, this.ui['present'], this.site.locale),
  }));

  protected readonly decisions = decisions.map((d) => ({
    ...d,
    links: d.evidence
      .map((e) => this.decisionLink(e))
      .filter((l): l is DecisionLink => l !== undefined),
  }));

  protected readonly groups = resolveSkills(this.content.skills, this.content);

  /** The headline's cycling phrase. It starts on the last phrase, which is the prerendered text. */
  protected readonly phrase = signal(this.hero.phrases[this.hero.phrases.length - 1]);

  constructor() {
    inject(SeoService).page('home', '/');
    const destroyRef = inject(DestroyRef);

    // Once, within 5 s, and only with motion allowed; reduced motion keeps the final sentence (REQ-MOT-102).
    afterNextRender(() => {
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
      const { phrases } = this.hero;
      const timers = headlineFrames(phrases.length).map((f) =>
        setTimeout(() => {
          this.phrase.set(phrases[f.index]);
          this.view.detectChanges();
        }, f.at),
      );
      destroyRef.onDestroy(() => timers.forEach(clearTimeout));
    });
  }

  private decisionLink(e: DecisionEvidence): DecisionLink | undefined {
    if (e.url) return { label: e.label, href: e.url };
    const found = e.ref ? resolveEvidence(e.ref, this.content) : undefined;
    if (!found) return undefined;
    return {
      label: e.label,
      href: found.href,
      link: found.href ? undefined : found.link,
    };
  }
}
