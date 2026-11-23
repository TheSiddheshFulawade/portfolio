import { inject } from '@angular/core';
import { RenderMode, ServerRoute } from '@angular/ssr';
import { ContentService } from './core/content/content.service';

export const serverRoutes: ServerRoute[] = [
  {
    // One prerendered page per published project (REQ-PAGE-001, REQ-CONTENT-003).
    path: 'projects/:slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => inject(ContentService).projects.map((p) => ({ slug: p.id })),
  },
  {
    // One prerendered page per published note (REQ-NOTE-001).
    path: 'notes/:slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => inject(ContentService).notes.map((n) => ({ slug: n.id })),
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
