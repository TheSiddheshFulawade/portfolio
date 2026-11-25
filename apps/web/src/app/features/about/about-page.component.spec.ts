import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { ContentService } from '../../core/content/content.service';
import { Photo, Profile, SkillGroup } from '../../core/content/content.types';
import { AboutPageComponent } from './about-page.component';

interface Override {
  resume?: { label: string; url: string };
  photo?: Photo;
  skills?: SkillGroup[];
}

/** Real content with parts replaced; keys present in `o` win, even when undefined. */
function contentWith(o: Override) {
  return {
    provide: ContentService,
    useFactory: () => {
      const real = new ContentService();
      const profile: Profile = { ...real.profile };
      if ('resume' in o) profile.resume = o.resume;
      if ('photo' in o) profile.photo = o.photo;
      return Object.assign(real, {
        profile,
        skills: o.skills ?? real.skills,
      }) as unknown as ContentService;
    },
  };
}

const PHOTO: Photo = {
  src: '/portrait.webp',
  alt: 'Portrait of the engineer',
  width: 1200,
  height: 1500,
};

async function setup(o: Override = {}) {
  const { container } = await render(AboutPageComponent, {
    providers: [provideRouter([]), contentWith(o)],
  });
  return { container, content: TestBed.inject(ContentService) };
}

const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('AboutPageComponent', () => {
  it('REQ-ABOUT-101 has one h1 and every bio paragraph from content', async () => {
    const { content } = await setup();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    for (const paragraph of content.profile.bio) {
      expect(screen.getByText(paragraph.trim())).toBeTruthy();
    }
  });

  it('REQ-ABOUT-101 REQ-UI-105 shows the photo with alt, width and height when profile.photo is set', async () => {
    const { container } = await setup({ photo: PHOTO });

    const img = container.querySelector('img')!;
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toContain('portrait.webp');
    expect(img.getAttribute('alt')).toBe(PHOTO.alt);
    expect(img.getAttribute('width')).toBe('1200');
    expect(img.getAttribute('height')).toBe('1500');
    expect(+img.getAttribute('width')! * 5).toBe(+img.getAttribute('height')! * 4);
  });

  it('REQ-ABOUT-101 REQ-UI-105 closes up without the photo: no img, no figure, no placeholder', async () => {
    const { container } = await setup({ photo: undefined });

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('figure')).toBeNull();
    expect(container.querySelector('svg[role="img"], [class*="placeholder"]')).toBeNull();
    expect(text(container).toLowerCase()).not.toContain('placeholder');
    expect(container.querySelectorAll('p').length).toBeGreaterThan(0);
  });

  it('REQ-ABOUT-101 shows the four capability groups in content order', async () => {
    const { container, content } = await setup();

    expect(content.skills).toHaveLength(4);
    expect([...container.querySelectorAll('h3')].map(text)).toEqual(
      content.skills.map((g) => g.label),
    );
  });

  it('REQ-ABOUT-101 links experience evidence to /experience#id and project evidence to /projects/id', async () => {
    const { container, content } = await setup();
    const hrefs = new Set([...container.querySelectorAll('a')].map((a) => a.getAttribute('href')));
    const ids = new Set(content.skills.flatMap((g) => g.skills.flatMap((s) => s.evidence)));

    const roles = content.experience.filter((r) => ids.has(r.id));
    const projects = content.projects.filter((p) => ids.has(p.id));
    expect(roles.length).toBeGreaterThan(0);
    expect(projects.length).toBeGreaterThan(0);
    for (const role of roles) expect(hrefs, role.id).toContain(`/experience#${role.id}`);
    for (const project of projects) expect(hrefs, project.id).toContain(`/projects/${project.id}`);
  });

  it('REQ-ABOUT-101 hides a skill that has no evidence, or whose evidence does not resolve', async () => {
    const project = new ContentService().projects[0];
    const { container } = await setup({
      skills: [
        {
          id: 'group-a',
          order: 10,
          label: 'Group A',
          skills: [
            { name: 'ShownSkill', evidence: [project.id] },
            { name: 'EmptyEvidenceSkill', evidence: [] },
            { name: 'DanglingEvidenceSkill', evidence: ['no-such-id'] },
          ],
        },
      ],
    });

    const body = text(container);
    expect(body).toContain('ShownSkill');
    expect(body).not.toContain('EmptyEvidenceSkill');
    expect(body).not.toContain('DanglingEvidenceSkill');
  });

  it('REQ-PAGE-008 links to the resume when the profile has one', async () => {
    await setup({ resume: { label: 'Resume (PDF)', url: '/resume.pdf' } });

    expect(screen.getByRole('link', { name: 'Resume (PDF)' }).getAttribute('href')).toBe(
      '/resume.pdf',
    );
  });

  it('REQ-PAGE-008 shows no resume link when the profile has none', async () => {
    const { container } = await setup({ resume: undefined });

    expect(screen.queryByRole('link', { name: /resume/i })).toBeNull();
    expect(container.querySelector('a[href*="resume.pdf"]')).toBeNull();
  });

  it('REQ-ABOUT-101 names no employer or institute, and labels role evidence by title', async () => {
    const { container, content } = await setup();
    const names = [
      ...content.experience.map((r) => r.company),
      ...content.education.degrees.map((d) => d.institution),
    ];

    for (const name of names) expect(text(container), name).not.toContain(name);
    // Short forms too: the content-driven names above would miss "ReBIT" or "IIT Bombay" on their own.
    expect(text(container)).not.toMatch(/ReBIT|Reserve Bank|e-?Kuber|Lumu|IIT Bombay|NanoBios/i);
    const role = content.experience.find((r) => r.end === null)!;
    const link = container.querySelector(`a[href="/experience#${role.id}"]`);
    expect(link).not.toBeNull();
    expect(text(link!)).toContain(role.title);
  });

  it('REQ-EXP-101 education has moved to Experience: About shows none of it', async () => {
    const { container, content } = await setup();
    const edu = content.education;

    expect(screen.queryByRole('heading', { name: content.site.ui['educationHeading'] })).toBeNull();
    for (const d of edu.degrees) expect(text(container)).not.toContain(d.degree);
    for (const c of edu.certifications) expect(text(container)).not.toContain(c.name);
    for (const a of edu.achievements) expect(text(container)).not.toContain(a.text);
  });

  it('REQ-ABOUT-101 heading order never skips a level and no element has an inline style', async () => {
    const { container } = await setup({ photo: PHOTO });

    const levels = [...container.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => +h.tagName[1]);
    expect(levels[0]).toBe(1);
    levels.forEach((l, i) => {
      if (i > 0) expect(l, `heading #${i}`).toBeLessThanOrEqual(levels[i - 1] + 1);
    });
    expect(container.querySelectorAll('[style]')).toHaveLength(0);
  });
});
