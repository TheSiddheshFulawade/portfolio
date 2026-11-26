import { ContentService } from './content.service';
import { resolveEvidence, resolveSkills } from './evidence';

describe('evidence resolver', () => {
  const content = new ContentService();

  it('REQ-ABOUT-101 resolves a project to its page and a role to its anchor, labelled without the company', () => {
    const project = content.projects[0];
    const role = content.experience[0];

    expect(resolveEvidence(project.id, content)?.link).toEqual(['/projects', project.id]);
    const link = resolveEvidence(role.id, content)!;
    expect(link.link).toEqual(['/experience']);
    expect(link.fragment).toBe(role.id);
    expect(link.label).toContain(role.title);
    expect(link.label).not.toContain(role.company);
  });

  it('REQ-ABOUT-101 resolves `site` to the external source link labelled from content', () => {
    const link = resolveEvidence('site', content)!;

    expect(link.href).toBe(content.site.footer.sourceUrl);
    expect(link.label).toBe(content.site.ui['thisSite']);
  });

  it('REQ-ABOUT-101 drops unknown ids and hides skills that resolve to nothing', () => {
    expect(resolveEvidence('no-such-id', content)).toBeUndefined();
    const [group] = resolveSkills(
      [
        {
          id: 'g',
          order: 1,
          label: 'G',
          skills: [
            { name: 'Kept', evidence: ['site', 'no-such-id'] },
            { name: 'Empty', evidence: [] },
            { name: 'Dangling', evidence: ['no-such-id'] },
          ],
        },
      ],
      content,
    );

    expect(group.skills.map((s) => s.name)).toEqual(['Kept']);
    expect(group.skills[0].evidence).toHaveLength(1);
  });
});
