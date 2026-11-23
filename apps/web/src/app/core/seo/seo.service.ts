import { DOCUMENT, Injectable, inject } from '@angular/core';
import { Meta, MetaDefinition, Title } from '@angular/platform-browser';
import { ContentService } from '../content/content.service';
import { PageKey } from '../content/content.types';

export interface SeoItem {
  title: string;
  description: string;
  /** Path on the site, e.g. /projects/settlement-lab. */
  path: string;
}

/**
 * Per-route <title>, meta description, canonical URL and Open Graph / Twitter tags, all from content/
 * (REQ-SEO-001). Pages call it on creation, so the prerendered HTML carries the tags.
 */
/**
 * Cloudflare Pages serves each prerendered route as a folder and answers `/about` with a 308 to `/about/`,
 * so canonical and Open Graph URLs use the final form (REQ-SEO-003).
 */
export function withTrailingSlash(path: string): string {
  return path.endsWith('/') ? path : `${path}/`;
}

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly content = inject(ContentService);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  /** A page whose title and description live in site.yaml `pages`. */
  page(key: Exclude<PageKey, 'notFound'>, path: string): void {
    const { title, description } = this.content.page(key);
    this.apply({ title, description, path }, 'website');
  }

  /** One content item, such as a project. */
  item(item: SeoItem): void {
    this.apply(item, 'article');
  }

  /** The 404 page: never indexed, no canonical URL. */
  notFound(): void {
    const { title, description } = this.content.page('notFound');
    this.setCommon(title, description);
    this.meta.updateTag({ name: 'robots', content: 'noindex' });
    this.meta.removeTag('property="og:url"');
    this.canonical(null);
  }

  private apply(item: SeoItem, type: 'website' | 'article'): void {
    const url = this.content.site.url + withTrailingSlash(item.path);
    this.setCommon(item.title, item.description);
    this.meta.removeTag('name="robots"');
    this.meta.updateTag({ property: 'og:type', content: type });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.canonical(url);
  }

  private setCommon(title: string, description: string): void {
    const site = this.content.site;
    this.title.setTitle(title);
    const tags: MetaDefinition[] = [
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:site_name', content: site.title },
      { property: 'og:locale', content: site.locale },
      { property: 'og:image', content: site.url + site.ogImage },
      { property: 'og:image:alt', content: site.ogImageAlt },
      { name: 'twitter:card', content: 'summary_large_image' },
    ];
    for (const tag of tags) this.meta.updateTag(tag);
  }

  private canonical(url: string | null): void {
    const head = this.document.head;
    let link = head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (url === null) {
      link?.remove();
      return;
    }
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      head.appendChild(link);
    }
    link.setAttribute('href', url);
  }
}
