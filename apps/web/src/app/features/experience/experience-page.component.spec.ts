import { TestBed } from '@angular/core/testing';
import { render, screen, within } from '@testing-library/angular';
import { ContentService } from '../../core/content/content.service';
import { ExperiencePageComponent } from './experience-page.component';

async function setup() {
  const { container } = await render(ExperiencePageComponent);
  return { container, content: TestBed.inject(ContentService) };
}

const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

function article(id: string) {
  const anchor = document.getElementById(id)!;
  return (anchor.closest('article') ?? anchor) as HTMLElement;
}

describe('ExperiencePageComponent', () => {
  it('REQ-EXP-101 has one h1 with the page heading from content/site.yaml', async () => {
    const { content } = await setup();

    const h1 = screen.getAllByRole('heading', { level: 1 });
    expect(h1).toHaveLength(1);
    expect(text(h1[0])).toBe(content.site.pages.experience.heading);
  });

  it('REQ-EXP-101 lists every role in content order, one article each, keeping its id anchor', async () => {
    const { container, content } = await setup();

    const articles = [...container.querySelectorAll('article')];
    expect(articles).toHaveLength(content.experience.length);
    articles.forEach((a, i) => {
      const role = content.experience[i];
      const anchor = document.getElementById(role.id);
      // Skill evidence on About and Home links here by fragment.
      expect(anchor, role.id).not.toBeNull();
      expect(a.contains(anchor) || anchor!.contains(a), role.id).toBe(true);
      expect(within(a).getByRole('heading', { level: 2 }).textContent?.trim()).toBe(role.title);
    });
  });

  it('REQ-EXP-101 every highlight in content is rendered exactly once on the page', async () => {
    const { container, content } = await setup();
    const items = content.experience.flatMap((r) => r.highlights.flatMap((g) => g.items));
    const rendered = [...container.querySelectorAll('li')].map(text);

    for (const item of items) {
      expect(rendered.filter((t) => t === item.trim()).length, item).toBe(1);
    }
  });

  it('REQ-EXP-101 groups highlights under their theme heading, in content order', async () => {
    const { content } = await setup();

    for (const role of content.experience) {
      const el = article(role.id);
      const h3 = [...el.querySelectorAll('h3')].slice(0, role.highlights.length);
      expect(h3.map(text), role.id).toEqual(role.highlights.map((g) => g.theme));
      h3.forEach((heading, i) => {
        const group = heading.parentElement!;
        expect([...group.querySelectorAll('li')].map(text), role.id).toEqual(
          role.highlights[i].items.map((s) => s.trim()),
        );
      });
    }
  });

  it('REQ-EXP-101 the rail (aside) holds dates, place, mode and stack, not the story', async () => {
    const { content } = await setup();

    for (const role of content.experience) {
      const rail = article(role.id).querySelector('aside');
      expect(rail, role.id).not.toBeNull();
      expect(rail!.querySelector('time')?.getAttribute('datetime'), role.id).toBe(role.start);
      expect(text(rail!), role.id).toMatch(/[A-Z][a-z]{2} \d{4} – ([A-Z][a-z]{2} \d{4}|Present)/);
      expect(text(rail!)).toContain(role.location);
      expect(text(rail!)).toContain(role.mode);
      const railItems = [...rail!.querySelectorAll('li')].map(text);
      for (const tech of role.stack) expect(railItems, `${role.id} ${tech}`).toContain(tech);
      expect(text(rail!)).not.toContain(role.title);
      expect(text(rail!)).not.toContain(role.summary.trim());
    }
  });

  it('REQ-EXP-101 the detail column holds title, company, summary, themes and recognition, not dates or place', async () => {
    const { content } = await setup();

    for (const role of content.experience) {
      const detail = article(role.id).cloneNode(true) as HTMLElement;
      detail.querySelector('aside')!.remove();
      const t = text(detail);
      expect(t, role.id).toContain(role.title);
      expect(t).toContain(role.company);
      expect(t).toContain(role.summary.trim());
      for (const r of role.recognition ?? []) expect(t).toContain(r.trim());
      expect(t).not.toContain(role.location);
      expect(detail.querySelector('time')).toBeNull();
    }
  });

  it('REQ-EXP-101 the current role is marked Present in its rail', async () => {
    const { content } = await setup();
    const current = content.experience.find((r) => r.end === null)!;

    expect(text(article(current.id).querySelector('aside')!)).toContain('Present');
  });

  it('REQ-EXP-101 education follows the roles: degrees, certifications and achievements, each shown once', async () => {
    const { container, content } = await setup();
    const edu = content.education;
    const heading = screen.getByRole('heading', {
      level: 2,
      name: content.site.ui['educationHeading'],
    });
    const lastRole = [...container.querySelectorAll('article')].at(-1)!;
    expect(
      lastRole.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const body = text(container);
    const once = (s: string) => body.split(s.trim()).length - 1;
    for (const d of edu.degrees) {
      expect(once(d.degree), d.degree).toBe(1);
      expect(once(d.institution), d.institution).toBe(1);
    }
    for (const c of edu.certifications) expect(once(c.name), c.name).toBe(1);
    for (const a of edu.achievements) expect(once(a.text), a.text).toBe(1);
  });

  it('REQ-EXP-101 heading order never skips a level and no element has an inline style', async () => {
    const { container } = await setup();

    const levels = [...container.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => +h.tagName[1]);
    expect(levels[0]).toBe(1);
    levels.forEach((l, i) => {
      if (i > 0) expect(l, `heading #${i}`).toBeLessThanOrEqual(levels[i - 1] + 1);
    });
    expect(container.querySelectorAll('[style]')).toHaveLength(0);
  });
});
