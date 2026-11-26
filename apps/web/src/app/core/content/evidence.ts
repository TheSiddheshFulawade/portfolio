import type { ContentService } from './content.service';
import type { SkillGroup } from './content.types';
import { formatMonthRange } from '../../shared/format/month';

/** The parts of the content service that evidence needs; keeps these functions pure and easy to test. */
export type EvidenceSource = Pick<ContentService, 'project' | 'experience' | 'site'>;

/** A resolved evidence reference: an internal route (with a fragment for a role) or an external URL. */
export interface EvidenceLink {
  id: string;
  label: string;
  /** Router link for a project or a role; empty when `href` is set. */
  link: string[];
  fragment?: string;
  /** External URL (the site's own source, id `site`). */
  href?: string;
}

/**
 * Resolves an evidence id: a project, an experience role or `site` (the footer's source link). Unpublished
 * or unknown ids give `undefined` (REQ-CONTENT-003). A role is labelled by title and dates, never by company
 * (brief decision 4: employer names appear on the Experience page only).
 */
export function resolveEvidence(id: string, source: EvidenceSource): EvidenceLink | undefined {
  if (id === 'site') {
    return {
      id,
      label: source.site.ui['thisSite'],
      link: [],
      href: source.site.footer.sourceUrl,
    };
  }
  const project = source.project(id);
  if (project) return { id, label: project.title, link: ['/projects', id] };
  const role = source.experience.find((r) => r.id === id);
  if (!role) return undefined;
  const dates = formatMonthRange(
    role.start,
    role.end,
    source.site.ui['present'],
    source.site.locale,
  );
  return { id, label: `${role.title}, ${dates}`, link: ['/experience'], fragment: id };
}

export interface ResolvedSkill {
  name: string;
  evidence: EvidenceLink[];
}

export interface ResolvedGroup extends Omit<SkillGroup, 'skills'> {
  skills: ResolvedSkill[];
}

/** Groups with every skill's evidence resolved; a skill that resolves to nothing is dropped (REQ-ABOUT-101). */
export function resolveSkills(
  groups: readonly SkillGroup[],
  source: EvidenceSource,
): ResolvedGroup[] {
  return groups.map((group) => ({
    ...group,
    skills: group.skills
      .map((skill) => ({
        name: skill.name,
        evidence: skill.evidence
          .map((id) => resolveEvidence(id, source))
          .filter((e): e is EvidenceLink => e !== undefined),
      }))
      .filter((skill) => skill.evidence.length > 0),
  }));
}
