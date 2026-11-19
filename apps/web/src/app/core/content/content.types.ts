// Shape of src/generated/content.json, produced by scripts/build-content.mjs from content/.
// Keep in sync with content/_schema/*.json.

export interface Shared {
  id: string;
  published: boolean;
  featured?: boolean;
  order: number;
  updated: string;
}

export interface NavItem {
  label: string;
  path: string;
}

export interface PageMeta {
  title: string;
  description: string;
  heading?: string;
  body?: string;
  action?: string;
}

export type PageKey = 'home' | 'experience' | 'projects' | 'about' | 'contact' | 'notFound';

export interface Site {
  title: string;
  url: string;
  locale: string;
  nav: NavItem[];
  pages: Record<PageKey, PageMeta>;
  footer: { note: string; sourceLabel: string; sourceUrl: string };
  ui: Record<string, string>;
}

export interface Link {
  id: string;
  label: string;
  url: string;
}

export interface Profile {
  name: string;
  headline: string;
  location: string;
  summary: string;
  bio: string[];
  email: string;
  links: Link[];
  resume: { label: string; url: string };
}

export interface Metric {
  id: string;
  order: number;
  value: string;
  label: string;
  source: string;
}

export interface Experience extends Shared {
  company: string;
  title: string;
  location: string;
  mode: 'On-site' | 'Remote' | 'Hybrid';
  start: string;
  end: string | null;
  summary: string;
  highlights: string[];
  recognition?: string[];
  stack: string[];
}

export interface Project extends Shared {
  title: string;
  tagline: string;
  status: string;
  stack: string[];
  repo?: string;
  /** Rendered from the Markdown body at build time. */
  html: string;
}

export interface SkillGroup {
  id: string;
  order: number;
  label: string;
  skills: { name: string; evidence: string[] }[];
}

export interface Education {
  degrees: {
    id: string;
    order: number;
    institution: string;
    degree: string;
    start: number;
    end: number;
    grade?: string;
  }[];
  certifications: { id: string; order: number; name: string; issuer: string }[];
  achievements: { id: string; order: number; text: string }[];
}

export interface SiteContent {
  site: Site;
  profile: Profile;
  metrics: Metric[];
  experience: Experience[];
  projects: Project[];
  skills: SkillGroup[];
  education: Education;
}
