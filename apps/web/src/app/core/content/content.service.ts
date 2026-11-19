import { Injectable } from '@angular/core';
import generated from '../../../generated/content.json';
import { PageKey, PageMeta, Project, SiteContent } from './content.types';

/**
 * The only way components read copy (constitution 6.1, REQ-CONTENT-001). The data is generated at
 * build time from content/ by scripts/build-content.mjs, already validated, filtered and sorted.
 */
@Injectable({ providedIn: 'root' })
export class ContentService {
  private readonly content = generated as unknown as SiteContent;

  readonly site = this.content.site;
  readonly profile = this.content.profile;
  readonly metrics = this.content.metrics;
  readonly experience = this.content.experience;
  readonly projects = this.content.projects;
  readonly featuredProjects = this.projects.filter((p) => p.featured);
  readonly skills = this.content.skills;
  readonly education = this.content.education;

  project(id: string): Project | undefined {
    return this.projects.find((p) => p.id === id);
  }

  page(key: PageKey): PageMeta {
    return this.site.pages[key];
  }
}
