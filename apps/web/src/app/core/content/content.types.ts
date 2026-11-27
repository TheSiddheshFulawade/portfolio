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

export type PageKey =
  'home' | 'experience' | 'projects' | 'notes' | 'about' | 'contact' | 'notFound';

export interface Site {
  title: string;
  url: string;
  locale: string;
  ogImage: string;
  ogImageAlt: string;
  nav: NavItem[];
  pages: Record<PageKey, PageMeta>;
  footer: {
    identity: string;
    copyrightYear: number;
    navLabel: string;
    siteHeading: string;
    systemsHeading: string;
    profilesHeading: string;
    note: string;
    sourceLabel: string;
    sourceUrl: string;
  };
  contact: { heading: string; body: string };
  ui: Record<string, string>;
  /** The two section labels About shows; the full set is Home-only (HomeContent.sections). */
  sections: Pick<Sections, 'capabilities' | 'capabilitiesIntro'>;
}

/** Copy of the invariant field: a simplified double-entry model run in the browser. */
export interface FieldContent {
  heading: string;
  intro: string[];
  actions: Record<'node' | 'partition' | 'duplicate', string>;
  counters: Record<
    'committed' | 'reachable' | 'unreachable' | 'recovering' | 'duplicates' | 'net',
    string
  >;
  status: Record<
    | 'rest'
    | 'node'
    | 'nodeReplay'
    | 'nodeDone'
    | 'partition'
    | 'partitionDone'
    | 'duplicate'
    | 'duplicateDone',
    string
  >;
  caption: string;
}

export interface Hero {
  lead: string;
  /** 2 to 5 phrases; the last is the resting state. */
  phrases: string[];
  /** The whole sentence for screen readers and reduced motion. */
  srSentence: string;
  /** One line under the headline: the failure path first, then the guarantee. */
  support?: string;
}

export interface Sections {
  selected: string;
  experience: string;
  decisions: string;
  capabilities: string;
  contact: string;
  [key: string]: string;
}

export interface Link {
  id: string;
  label: string;
  url: string;
}

/** The portrait (REQ-UI-105): 4:5, under 60 KB, checked at build time. */
export interface Photo {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface Profile {
  name: string;
  headline: string;
  location: string;
  summary: string;
  bio: string[];
  email: string;
  links: Link[];
  resume?: { label: string; url: string };
  photo?: Photo;
}

export interface Metric {
  id: string;
  order: number;
  value: string;
  label: string;
  source: string;
}

/** Impact bullets grouped under a theme (REQ-EXP-101); both order and grouping come from content. */
export interface ThemedHighlights {
  theme: string;
  items: string[];
}

export interface Experience extends Shared {
  company: string;
  title: string;
  location: string;
  mode: 'On-site' | 'Remote' | 'Hybrid';
  start: string;
  end: string | null;
  summary: string;
  /** Shown on Home instead of `summary` when set, so Home names no employer or system. */
  homeSummary?: string;
  highlights: ThemedHighlights[];
  recognition?: string[];
  stack: string[];
}

export interface Project extends Shared {
  title: string;
  tagline: string;
  status: string;
  stack: string[];
  /** Shown under "Earlier work", without a repo link. */
  earlier?: boolean;
  repo?: string;
  /** Release state (REQ-ACC-005); an in-development project lists what is proven and planned. */
  phase?: ProjectPhase;
  /** What merged tests prove. */
  proven?: string[];
  /** What is designed but not built or not proven yet. */
  planned?: string[];
  // The rendered Markdown body is not part of the shell: see project-bodies.ts.
}

export type ProjectPhase = 'in-development' | 'released';

export interface Note extends Omit<Shared, 'order'> {
  /** Notes sort by date, newest first; order is not used. */
  order?: number;
  title: string;
  summary: string;
  /** Publication date, YYYY-MM-DD. */
  date: string;
  tags: string[];
  /** Computed at build time from the word count. */
  readingMinutes: number;
  /** Rendered from the Markdown body at build time. */
  html: string;
}

/** One of exactly four capability groups (REQ-ABOUT-101). Skills without evidence are removed at build time. */
export interface SkillGroup {
  id: string;
  order: number;
  label: string;
  summary?: string;
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
  notes: Note[];
  skills: SkillGroup[];
  education: Education;
}

/** An evidence link on a decision: a content id (`ref`) or an https/site url, never both. */
export interface DecisionEvidence {
  label: string;
  ref?: string;
  url?: string;
}

/** A design decision (REQ-HOME-105): what was chosen, what was rejected, why, and what it costs. */
export interface Decision {
  id: string;
  order: number;
  title: string;
  choice: string;
  rejected: string;
  reason: string;
  cost: string;
  evidence: DecisionEvidence[];
}

/** src/generated/home.json: data only the Home page needs (REQ-PERF-101), kept out of the shell. */
export interface HomeContent {
  decisions: Decision[];
  /** Home hero: a fixed lead and rotating phrases (REQ-HOME-101). */
  hero: Hero;
  /** Section labels of the Home page (REQ-HOME-104). */
  sections: Sections;
  /** The invariant field (REQ-HOME-103). */
  field: FieldContent;
  /** The Home-only ui labels. */
  ui: Record<string, string>;
}

export interface ResultRow {
  ledger: string;
  threads: string;
  fault: string;
  transfers: number;
  submissionsPerSecond: number;
  p50Us: number;
  p99Us: number;
  rejected: number;
  duplicates: number;
  retries: number;
  breakerOpens: number;
  outboxPeak: number;
  invariantsPassed: boolean;
  firstFailure?: string;
}

/** A measured result with every fact of REQ-ACC-004, taken from the repo's results at a recorded commit. */
export interface BenchmarkResult {
  id: string;
  measured: string;
  machine: string;
  os: string;
  cores: number;
  jdk: string;
  runs: number;
  runDate: string;
  workload: string;
  source: { repo: string; commit: string; path: string };
  rows: ResultRow[];
}

/** src/generated/results.json, keyed by result id. */
export type ResultsContent = Record<string, BenchmarkResult>;

type Texts = Record<string, string>;

/** Copy of the Settlement Lab board and results table (content/lab.yaml, spec 005 RD-07). */
export interface LabContent {
  board: {
    heading: string;
    label: string;
    lead: string;
    notes: string[];
    chartCaption: string;
    controls: {
      mode: string;
      fault: string;
      run: string;
      modes: Texts;
      faults: Texts;
    };
    status: Texts;
    invariants: Texts;
    stats: Texts;
    breakerStates: Texts;
    workers: { heading: string; label: string; states: Texts };
    accounts: { summary: string };
    /** Heading, the start and end lines, one template per event code, and the words for the publish sources. */
    log: { heading: string; sources: Texts; [line: string]: string | Texts };
  };
  results: {
    heading: string;
    intro: string;
    caption: string;
    scrollLabel: string;
    facts: Texts;
    cores: string;
    runOne: string;
    runMany: string;
    columns: Texts;
    values: Texts;
    invariantsPassed: string;
    invariantsFailed: string;
  };
}
