import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { SeoService } from './seo.service';

const meta = (selector: string) => TestBed.inject(Meta).getTag(selector)?.content;
const canonical = () =>
  TestBed.inject(DOCUMENT).head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

describe('SeoService', () => {
  afterEach(() => canonical()?.remove());

  it('REQ-SEO-001 sets title, description, canonical and Open Graph tags for a page from content', () => {
    TestBed.inject(SeoService).page('experience', '/experience');

    expect(TestBed.inject(Title).getTitle()).toBe('Experience · Siddhesh Fulawade');
    expect(meta('name="description"')).toContain('Roles, responsibilities and impact');
    expect(canonical()?.getAttribute('href')).toBe('https://siddheshfulawade.com/experience');
    expect(meta('property="og:title"')).toBe('Experience · Siddhesh Fulawade');
    expect(meta('property="og:url"')).toBe('https://siddheshfulawade.com/experience');
    expect(meta('property="og:type"')).toBe('website');
    expect(meta('property="og:site_name"')).toBe('Siddhesh Fulawade');
    expect(meta('property="og:image"')).toBe('https://siddheshfulawade.com/og.png');
    expect(meta('name="twitter:card"')).toBe('summary_large_image');
    expect(meta('name="robots"')).toBeUndefined();
  });

  it('REQ-SEO-001 sets the meta for one item, with article type', () => {
    TestBed.inject(SeoService).item({
      title: 'Settlement Lab · Siddhesh Fulawade',
      description: 'A settlement engine.',
      path: '/projects/settlement-lab',
    });

    expect(TestBed.inject(Title).getTitle()).toBe('Settlement Lab · Siddhesh Fulawade');
    expect(canonical()?.getAttribute('href')).toBe(
      'https://siddheshfulawade.com/projects/settlement-lab',
    );
    expect(meta('property="og:type"')).toBe('article');
  });

  it('REQ-SEO-001 the not-found page is noindex and has no canonical URL', () => {
    const seo = TestBed.inject(SeoService);
    seo.page('home', '/');

    seo.notFound();

    expect(TestBed.inject(Title).getTitle()).toBe('Page not found · Siddhesh Fulawade');
    expect(meta('name="robots"')).toBe('noindex');
    expect(canonical()).toBeNull();
  });

  it('REQ-SEO-001 a normal page after the not-found page drops noindex', () => {
    const seo = TestBed.inject(SeoService);
    seo.notFound();

    seo.page('home', '/');

    expect(meta('name="robots"')).toBeUndefined();
    expect(canonical()?.getAttribute('href')).toBe('https://siddheshfulawade.com/');
  });
});
