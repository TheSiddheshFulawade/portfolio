import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/seo/seo.service';
import { ContentService } from '../../core/content/content.service';
import { formatMonthRange } from '../../shared/format/month';

interface EvidenceLink {
  id: string;
  label: string;
  link: string[];
  fragment?: string;
}

/**
 * About (REQ-PAGE-006): bio, skills grouped with evidence links, education. Experience evidence is labelled by
 * role and dates, never by company (brief decision 4: employer names appear on the Experience page only).
 */
@Component({
  selector: 'sf-about-page',
  imports: [RouterLink],
  templateUrl: './about-page.component.html',
  styleUrl: './about-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutPageComponent {
  private readonly content = inject(ContentService);

  protected readonly page = this.content.page('about');
  protected readonly profile = this.content.profile;
  protected readonly ui = this.content.site.ui;
  protected readonly education = this.content.education;
  protected readonly groups = this.content.skills.map((group) => ({
    ...group,
    skills: group.skills.map((skill) => ({
      name: skill.name,
      evidence: skill.evidence
        .map((id) => this.evidence(id))
        .filter((e): e is EvidenceLink => e !== undefined),
    })),
  }));

  constructor() {
    inject(SeoService).page('about', '/about');
  }

  /** Resolves an evidence id to a link; unpublished or unknown ids are dropped (REQ-CONTENT-003). */
  private evidence(id: string): EvidenceLink | undefined {
    const project = this.content.project(id);
    if (project) return { id, label: project.title, link: ['/projects', id] };
    const role = this.content.experience.find((r) => r.id === id);
    if (!role) return undefined;
    const dates = formatMonthRange(
      role.start,
      role.end,
      this.ui['present'],
      this.content.site.locale,
    );
    return { id, label: `${role.title}, ${dates}`, link: ['/experience'], fragment: id };
  }
}
