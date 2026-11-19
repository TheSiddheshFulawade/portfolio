import { TestBed } from '@angular/core/testing';
import { ContentService } from './content.service';

describe('ContentService', () => {
  const service = () => TestBed.inject(ContentService);

  it('REQ-CONTENT-001 exposes the profile and site copy from the generated content', () => {
    expect(service().profile.name).toBe('Siddhesh Fulawade');
    expect(service().profile.email).toBe('hello@siddheshfulawade.com');
    expect(service().site.nav.map((n) => n.path)).toContain('/projects');
  });

  it('REQ-CONTENT-004 returns projects in content order and finds one by id', () => {
    const projects = service().projects;
    const orders = projects.map((p) => p.order);

    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(service().project('settlement-lab')?.title).toBe('Settlement Lab');
    expect(service().project('does-not-exist')).toBeUndefined();
  });

  it('REQ-PAGE-002 lists featured projects only', () => {
    const featured = service().featuredProjects;

    expect(featured.length).toBeGreaterThan(0);
    expect(featured.every((p) => p.featured)).toBe(true);
  });

  it('REQ-CONTENT-005 every metric carries a source', () => {
    expect(service().metrics.every((m) => m.source.length > 0)).toBe(true);
  });

  it('REQ-SEO-001 returns page meta by key', () => {
    expect(service().page('home').title).toContain('Siddhesh Fulawade');
  });
});
