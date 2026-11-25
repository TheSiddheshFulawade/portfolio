// Spec 002 V1-02: build-time content pipeline. Reads content/ (YAML and Markdown), validates every file
// against content/_schema, enforces the disclosure rules, drops unpublished items, sorts, renders
// Markdown to HTML and writes src/generated/: content.json (the shell, read by ContentService),
// home.json (decisions), results.json (measured results) and bodies.json (project HTML), so
// page-only data never lands in the main bundle (REQ-PERF-101). Also public/sitemap.xml and
// public/robots.txt from the published routes (REQ-SEO-002).
// Usage: node scripts/build-content.mjs [--check]   (--check validates only and writes nothing)
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv from 'ajv';
import { marked } from 'marked';
import { parse as parseYaml } from 'yaml';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CONTENT_DIR = resolve(HERE, '../../../content');
export const DEFAULT_OUT_FILE = resolve(HERE, '../src/generated/content.json');
export const DEFAULT_HOME_FILE = resolve(HERE, '../src/generated/home.json');
export const DEFAULT_RESULTS_FILE = resolve(HERE, '../src/generated/results.json');
export const DEFAULT_BODIES_FILE = resolve(HERE, '../src/generated/bodies.json');
export const DEFAULT_PUBLIC_DIR = resolve(HERE, '../public');

const SITE_EMAIL = 'hello@siddheshfulawade.com';
/** Reading speed for a note's reading time (REQ-NOTE-001). */
const WORDS_PER_MINUTE = 200;
/** REQ-UI-105: the portrait must stay under 60 KB. */
const PHOTO_MAX_BYTES = 60 * 1024;

/** Disclosure and format rules (constitution 6, ADR-0004 C1). `where` limits a rule to some files. */
const RULES = [
  {
    re: /\b(TPH|TPS)\b|\btransactions? per (hour|minute|second)\b/i,
    where: (f) => f.startsWith('experience/'),
    msg: 'employer volume or throughput figure is not allowed; describe the guarantee instead',
  },
  {
    re: /\b\d{1,2},\d{2},\d{3}\b/,
    msg: 'write numbers in international format (100,000, not 1,00,000)',
  },
  {
    re: /\+?\d(?:[\s-]?\d){9,}/,
    msg: 'looks like a phone number; phone numbers are never published',
  },
];

/** Names from the work history that always stay inside content/experience (brief decision 4). */
const STATIC_EMPLOYER_NAMES = ['ReBIT', 'e-Kuber', 'Reserve Bank', 'IITB'];
const LEGAL_SUFFIX = /\s+(Oy|Ltd|Limited|Inc|LLC|GmbH|Pvt|Lab)\.?$/i;
const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Banned words derived from every company in content/experience: each comma-separated part, the part
 * without a legal suffix or "Lab", and any (alias) in parentheses, plus the static list.
 */
function employerNames(experience) {
  const names = new Set(STATIC_EMPLOYER_NAMES);
  for (const { company } of experience) {
    if (typeof company !== 'string') continue;
    for (const alias of company.matchAll(/\(([^)]+)\)/g)) names.add(alias[1].trim());
    for (const part of company.replace(/\([^)]*\)/g, '').split(',')) {
      const name = part.trim();
      if (!name) continue;
      names.add(name);
      names.add(name.replace(LEGAL_SUFFIX, ''));
    }
  }
  return [...names].filter((n) => n.length >= 3);
}

/** A banned name as a whole word, ignoring case ("IIT Kharagpur" does not match "IIT Bombay"). */
function employerRule(names) {
  const alternatives = names
    .map(escapeRe)
    .sort((x, y) => y.length - x.length)
    .join('|');
  return {
    re: new RegExp(`(?<![\\w-])(?:${alternatives})(?![\\w-])`, 'i'),
    where: (f) => !f.startsWith('experience/'),
    skipIds: true,
    msg: 'employer name outside the Experience page (brief decision 4)',
  };
}

function* strings(value) {
  if (typeof value === 'string') yield value;
  else if (Array.isArray(value)) for (const v of value) yield* strings(v);
  else if (value && typeof value === 'object')
    for (const v of Object.values(value)) yield* strings(v);
}

function disclosureErrors(file, data, rules) {
  const errors = [];
  for (const text of strings(data)) {
    const isId = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(text); // ids are references, never shown as text
    for (const rule of rules) {
      if (rule.skipIds && isId) continue;
      if ((!rule.where || rule.where(file)) && rule.re.test(text))
        errors.push(`${file}: ${rule.msg}: "${text.slice(0, 60)}"`);
    }
    for (const email of text.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) ?? []) {
      if (email !== SITE_EMAIL)
        errors.push(`${file}: email "${email}" is not allowed; only ${SITE_EMAIL} is published`);
    }
  }
  return errors;
}

function loadSchemas(schemaDir) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  for (const f of readdirSync(schemaDir).filter((n) => n.endsWith('.schema.json'))) {
    ajv.addSchema(JSON.parse(readFileSync(join(schemaDir, f), 'utf8')));
  }
  return (name) => ajv.getSchema(`${name}.schema.json`);
}

function splitFrontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  return m ? { front: m[1], body: m[2] } : null;
}

const byOrderThenNewest = (dateKey) => (a, b) =>
  (a.order ?? 0) - (b.order ?? 0) ||
  String(b[dateKey] ?? '').localeCompare(String(a[dateKey] ?? ''));

/**
 * Build the site content. Never throws for content problems: returns them as `errors`
 * (each "<file>: <field or rule> <message>") so the caller can report all of them at once.
 */
export async function buildContent({
  contentDir = DEFAULT_CONTENT_DIR,
  publicDir = DEFAULT_PUBLIC_DIR,
} = {}) {
  const errors = [];
  const schema = loadSchemas(join(contentDir, '_schema'));
  const rel = (p) => relative(contentDir, p).replace(/\\/g, '/');
  // Until the experience files are read, only the static rules apply (the employer rule needs them).
  let rules = RULES;
  const disclosure = (file, data) => disclosureErrors(file, data, rules);

  function check(file, name, data) {
    const validate = schema(name);
    if (!validate) return errors.push(`${file}: no schema named ${name}`) && false;
    const ok = validate(data);
    for (const e of validate.errors ?? [])
      errors.push(`${file}: ${e.instancePath || '/'} ${e.message}`);
    errors.push(...disclosure(file, data));
    return ok;
  }

  function readYaml(path) {
    try {
      return parseYaml(readFileSync(path, 'utf8'));
    } catch (err) {
      errors.push(`${rel(path)}: invalid YAML: ${err.message.split('\n')[0]}`);
      return undefined;
    }
  }

  const collection = (folder, ext, load) =>
    existsSync(join(contentDir, folder))
      ? readdirSync(join(contentDir, folder))
          .filter((n) => n.endsWith(ext))
          .sort()
          .map((n) => load(join(contentDir, folder, n), n.slice(0, -ext.length)))
          .filter(Boolean)
      : [];

  const experienceAll = collection('experience', '.yaml', (path, stem) => {
    const file = rel(path);
    const data = readYaml(path);
    if (data === undefined) return null;
    check(file, 'experience', data);
    if (data.id !== stem) errors.push(`${file}: id "${data.id}" must match the file name`);
    return data;
  });
  // Every company in content/experience is a banned word everywhere else (REQ-CONTENT-005).
  rules = [...RULES, employerRule(employerNames(experienceAll))];

  const single = {};
  for (const name of ['site', 'profile', 'metrics', 'skills', 'education', 'decisions']) {
    const path = join(contentDir, `${name}.yaml`);
    if (!existsSync(path)) {
      errors.push(`${name}.yaml: file is missing`);
      continue;
    }
    const data = readYaml(path);
    if (data !== undefined) check(`${name}.yaml`, name, data);
    single[name] = data;
  }

  /** REQ-UI-105: the portrait exists, is under 60 KB, is declared 4:5 and has alt text (schema). */
  function checkPhoto(photo) {
    if (!photo || typeof photo !== 'object') return;
    const { src, width, height } = photo;
    if (typeof src === 'string') {
      const file = join(publicDir, src);
      if (!existsSync(file)) {
        errors.push(`profile.yaml: photo "${src}" not found in public/`);
      } else if (statSync(file).size >= PHOTO_MAX_BYTES) {
        errors.push(`profile.yaml: photo "${src}" must be under 60 KB`);
      }
    }
    if (Number.isInteger(width) && Number.isInteger(height) && width * 5 !== height * 4)
      errors.push(`profile.yaml: photo must be 4:5 (width:height), got ${width}x${height}`);
  }
  checkPhoto(single.profile?.photo);

  const projectsAll = collection('projects', '.md', (path, stem) => {
    const file = rel(path);
    const parts = splitFrontMatter(readFileSync(path, 'utf8'));
    if (!parts) return errors.push(`${file}: missing front matter (--- ... ---)`) && null;
    let front;
    try {
      front = parseYaml(parts.front);
    } catch (err) {
      return errors.push(`${file}: invalid front matter: ${err.message.split('\n')[0]}`) && null;
    }
    check(file, 'project', front);
    errors.push(...disclosure(file, parts.body));
    if (front.id !== stem) errors.push(`${file}: id "${front.id}" must match the file name`);
    return { ...front, html: marked.parse(parts.body, { async: false, gfm: true }) };
  });

  const notesAll = collection('notes', '.md', (path, stem) => {
    const file = rel(path);
    const parts = splitFrontMatter(readFileSync(path, 'utf8'));
    if (!parts) return errors.push(`${file}: missing front matter (--- ... ---)`) && null;
    let front;
    try {
      front = parseYaml(parts.front);
    } catch (err) {
      return errors.push(`${file}: invalid front matter: ${err.message.split('\n')[0]}`) && null;
    }
    // YAML reads an unquoted date as a Date; the schema and the site use the YYYY-MM-DD text.
    for (const key of ['date', 'updated']) {
      if (front[key] instanceof Date) front[key] = front[key].toISOString().slice(0, 10);
    }
    check(file, 'note', front);
    errors.push(...disclosure(file, parts.body));
    if (front.id !== stem) errors.push(`${file}: id "${front.id}" must match the file name`);
    const words = parts.body.split(/\s+/).filter(Boolean).length;
    return {
      ...front,
      readingMinutes: Math.max(1, Math.ceil(words / WORDS_PER_MINUTE)),
      html: marked.parse(parts.body, { async: false, gfm: true }),
    };
  });
  const notes = notesAll
    .filter((n) => n.published)
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));

  const resultsAll = collection('results', '.yaml', (path, stem) => {
    const file = rel(path);
    const data = readYaml(path);
    if (data === undefined) return null;
    check(file, 'result', data);
    if (data.id !== stem) errors.push(`${file}: id "${data.id}" must match the file name`);
    return data;
  });
  const results = Object.fromEntries(resultsAll.filter((r) => r.published).map((r) => [r.id, r]));

  // "site" is the evidence for what this website itself is built with.
  const known = new Set([...experienceAll, ...projectsAll].map((x) => x.id).concat('site'));
  const published = new Set(
    [...experienceAll, ...projectsAll]
      .filter((x) => x.published)
      .map((x) => x.id)
      .concat('site'),
  );

  // REQ-ABOUT-101: evidence decides what is shown. A skill without published evidence is hidden,
  // and so is a group left with no skill.
  const skills = (single.skills?.groups ?? [])
    .map((g) => ({
      ...g,
      skills: g.skills
        .map((s) => {
          for (const id of s.evidence ?? []) {
            if (!known.has(id))
              errors.push(`skills.yaml: evidence "${id}" is not a known experience or project id`);
          }
          return { ...s, evidence: (s.evidence ?? []).filter((id) => published.has(id)) };
        })
        .filter((s) => s.evidence.length > 0),
    }))
    .filter((g) => g.skills.length > 0)
    .sort(byOrderThenNewest('id'));

  const sortList = (list) => [...(list ?? [])].sort(byOrderThenNewest('id'));
  // REQ-NOTE-002, REQ-CONTENT-003: no published notes means no Notes link anywhere.
  const site = single.site && {
    ...single.site,
    nav: (single.site.nav ?? []).filter((item) => item.path !== '/notes' || notes.length > 0),
  };
  const content = {
    site,
    profile: single.profile,
    metrics: sortList(single.metrics?.items),
    experience: experienceAll.filter((e) => e.published).sort(byOrderThenNewest('start')),
    projects: projectsAll.filter((p) => p.published).sort(byOrderThenNewest('updated')),
    notes,
    skills,
    education: single.education && {
      degrees: sortList(single.education.degrees),
      certifications: sortList(single.education.certifications),
      achievements: sortList(single.education.achievements),
    },
  };
  // REQ-PERF-101: Home-only data, kept out of the shell file.
  const home = { decisions: sortList(single.decisions?.items) };
  return { content, home, results, errors };
}

/**
 * Published routes in navigation order (REQ-PAGE-001). Keep in sync with src/app/app.routes.ts; the smoke test
 * fails if a sitemap route does not render. /404 is not a page to index.
 */
export function siteRoutes(content) {
  return [
    '/',
    '/experience',
    '/projects',
    ...content.projects.map((p) => `/projects/${p.id}`),
    ...(content.notes.length ? ['/notes', ...content.notes.map((n) => `/notes/${n.id}`)] : []),
    '/about',
    '/contact',
  ];
}

/**
 * REQ-SEO-002: sitemap.xml of the published routes on the production origin. Each URL ends in a slash,
 * the form Cloudflare Pages serves without a redirect (REQ-SEO-003).
 */
export function sitemapXml(content) {
  const urls = siteRoutes(content)
    .map(
      (route) =>
        `  <url><loc>${content.site.url}${route.endsWith('/') ? route : `${route}/`}</loc></url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** REQ-SEO-002: robots.txt that allows everything and points at the sitemap. */
export function robotsTxt(content) {
  return `User-agent: *\nAllow: /\n\nSitemap: ${content.site.url}/sitemap.xml\n`;
}

export async function main(
  argv = process.argv.slice(2),
  {
    out = DEFAULT_OUT_FILE,
    homeOut = DEFAULT_HOME_FILE,
    resultsOut = DEFAULT_RESULTS_FILE,
    bodiesOut = DEFAULT_BODIES_FILE,
    contentDir = DEFAULT_CONTENT_DIR,
    publicDir = DEFAULT_PUBLIC_DIR,
    log = console.log,
    error = console.error,
  } = {},
) {
  const { content, home, results, errors } = await buildContent({ contentDir, publicDir });
  if (errors.length) {
    error(
      `build-content: ${errors.length} problem(s) in content/:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
    );
    return 1;
  }
  if (argv.includes('--check')) {
    log('build-content: content/ is valid');
    return 0;
  }
  // REQ-PERF-101: the shell (content.json) holds what every page needs. Project bodies, decisions and
  // results are separate files that only the page components import, so they stay out of main-*.js.
  const bodies = Object.fromEntries(content.projects.map((p) => [p.id, p.html]));
  const shell = {
    ...content,
    projects: content.projects.map(({ html: _html, ...p }) => p),
  };
  for (const [file, data] of [
    [out, shell],
    [homeOut, home],
    [resultsOut, results],
    [bodiesOut, bodies],
  ]) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(data) + '\n');
  }
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(join(publicDir, 'sitemap.xml'), sitemapXml(content));
  writeFileSync(join(publicDir, 'robots.txt'), robotsTxt(content));
  log(
    `build-content: wrote content, home, results and bodies to ${relative(process.cwd(), dirname(out)).replace(/\\/g, '/')}/, plus sitemap.xml and robots.txt`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
