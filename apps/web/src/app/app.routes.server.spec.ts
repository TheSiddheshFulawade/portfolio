import { TestBed } from '@angular/core/testing';
import { ContentService } from './core/content/content.service';
import { serverRoutes } from './app.routes.server';

describe('server routes', () => {
  it('REQ-PAGE-001 prerenders one project page per published project', async () => {
    const route = serverRoutes.find((r) => r.path === 'projects/:slug');
    const params = route && 'getPrerenderParams' in route ? route.getPrerenderParams : undefined;

    const slugs = await TestBed.runInInjectionContext(() => params!());

    expect(slugs).toEqual(TestBed.inject(ContentService).projects.map((p) => ({ slug: p.id })));
  });
});
