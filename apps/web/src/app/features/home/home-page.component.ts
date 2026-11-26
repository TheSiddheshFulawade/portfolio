import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContentService } from '../../core/content/content.service';
import { DecisionEvidence } from '../../core/content/content.types';
import { resolveEvidence, resolveSkills } from '../../core/content/evidence';
import { decisions, homeContent } from '../../core/content/home-content';
import { SeoService } from '../../core/seo/seo.service';
import { headlineFrames } from '../../shared/canvas/headline-cycle';
import { formatMonthRange } from '../../shared/format/month';
import { InvariantFieldComponent } from './invariant-field.component';

/** The headline swap: 120 ms out and 200 ms in, the 320 ms fade that headlineFrames allows for. */
const SWAP_OUT_MS = 120;
const SWAP_IN_MS = 200;

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
  imports: [RouterLink, InvariantFieldComponent],
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
  /**
   * The other phrases, as empty boxes stacked under the live one: CSS draws each invisibly from its data-text, so
   * the headline is as tall as its longest phrase from the first paint and the swap moves nothing (CLS).
   */
  protected readonly reserve = this.hero.phrases.slice(0, -1);
  private readonly phraseRef = viewChild.required<ElementRef<HTMLElement>>('livePhrase');

  constructor() {
    inject(SeoService).page('home', '/');
    const destroyRef = inject(DestroyRef);

    // Once, within 5 s, and only with motion allowed; reduced motion keeps the final sentence (REQ-MOT-102).
    afterNextRender(() => {
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
      const { phrases } = this.hero;
      const el = this.phraseRef().nativeElement;
      const timers: ReturnType<typeof setTimeout>[] = [];
      const animations: Animation[] = [];
      // Each frame: the phrase leaves upward (opacity, transform), the text swaps, the next one rises in.
      // No fill outlives a swap, so nothing is left animating once the last phrase is in (REQ-MOT-101).
      for (const f of headlineFrames(phrases.length)) {
        timers.push(
          setTimeout(() => {
            const out = el.animate?.(
              [
                { opacity: 1, transform: 'none' },
                { opacity: 0, transform: 'translateY(-0.35em)' },
              ],
              { duration: SWAP_OUT_MS, easing: 'cubic-bezier(0.6, 0, 0.8, 0.3)', fill: 'forwards' },
            );
            if (out) animations.push(out);
            timers.push(
              setTimeout(() => {
                this.phrase.set(phrases[f.index]);
                this.view.detectChanges();
                out?.cancel();
                const enter = el.animate?.(
                  [
                    { opacity: 0, transform: 'translateY(0.4em)' },
                    { opacity: 1, transform: 'none' },
                  ],
                  { duration: SWAP_IN_MS, easing: 'cubic-bezier(0.15, 0.75, 0.25, 1)' },
                );
                if (enter) animations.push(enter);
              }, SWAP_OUT_MS),
            );
          }, f.at),
        );
      }
      destroyRef.onDestroy(() => {
        timers.forEach(clearTimeout);
        animations.forEach((a) => a.cancel());
      });
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
