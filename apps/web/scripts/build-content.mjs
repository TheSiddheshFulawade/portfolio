// Spec 002 V1-02: build-time content pipeline. Reads content/ (YAML and Markdown), validates every file
// against content/_schema, enforces the disclosure rules, drops unpublished items, sorts, renders
// Markdown to HTML and writes src/generated/content.json for ContentService, plus public/sitemap.xml and
// public/robots.txt from the published routes (REQ-SEO-002).
// Usage: node scripts/build-content.mjs [--check]   (--check validates only and writes nothing)
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv from 'ajv';
import { marked } from 'marked';
import { parse as parseYaml } from 'yaml';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CONTENT_DIR = resolve(HERE, '../../../content');
export const DEFAULT_OUT_FILE = resolve(HERE, '../src/generated/content.json');
export const DEFAULT_PUBLIC_DIR = resolve(HERE, '../public');

const SITE_EMAIL = 'hello@siddheshfulawade.com';

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
  {
    re: /\b(ReBIT|e-Kuber|Reserve Bank)\b/i,
    where: (f) => !f.startsWith('experience/'),
    skipIds: true,
    msg: 'employer name outside the Experience page (brief decision 4)',
  },
];

function* strings(value) {
  if (typeof value === 'string') yield value;
  else if (Array.isArray(value)) for (const v of value) yield* strings(v);
  else if (value && typeof value === 'object')
    for (const v of Object.values(value)) yield* strings(v);
}

function disclosureErrors(file, data) {
  const errors = [];
  for (const text of strings(data)) {
    const isId = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(text); // ids are references, never shown as text
    for (const rule of RULES) {
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
export async function buildContent({ contentDir = DEFAULT_CONTENT_DIR } = {}) {
  const errors = [];
  const schema = loadSchemas(join(contentDir, '_schema'));
  const rel = (p) => relative(contentDir, p).replace(/\\/g, '/');

  function check(file, name, data) {
    const validate = schema(name);
    if (!validate) return errors.push(`${file}: no schema named ${name}`) && false;
    const ok = validate(data);
    for (const e of validate.errors ?? [])
      errors.push(`${file}: ${e.instancePath || '/'} ${e.message}`);
    errors.push(...disclosureErrors(file, data));
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

  const single = {};
  for (const name of ['site', 'profile', 'metrics', 'skills', 'education']) {
    const path = join(contentDir, `${name}.yaml`);
    if (!existsSync(path)) {
      errors.push(`${name}.yaml: file is missing`);
      continue;
    }
    const data = readYaml(path);
    if (data !== undefined) check(`${name}.yaml`, name, data);
    single[name] = data;
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
    errors.push(...disclosureErrors(file, parts.body));
    if (front.id !== stem) errors.push(`${file}: id "${front.id}" must match the file name`);
    return { ...front, html: marked.parse(parts.body, { async: false, gfm: true }) };
  });

  const known = new Set([...experienceAll, ...projectsAll].map((x) => x.id));
  const published = new Set(
    [...experienceAll, ...projectsAll].filter((x) => x.published).map((x) => x.id),
  );

  const skills = (single.skills?.groups ?? [])
    .map((g) => ({
      ...g,
      skills: g.skills.map((s) => {
        for (const id of s.evidence ?? []) {
          if (!known.has(id))
            errors.push(`skills.yaml: evidence "${id}" is not a known experience or project id`);
        }
        return { ...s, evidence: (s.evidence ?? []).filter((id) => published.has(id)) };
      }),
    }))
    .sort(byOrderThenNewest('id'));

  const sortList = (list) => [...(list ?? [])].sort(byOrderThenNewest('id'));
  const content = {
    site: single.site,
    profile: single.profile,
    metrics: sortList(single.metrics?.items),
    experience: experienceAll.filter((e) => e.published).sort(byOrderThenNewest('start')),
    projects: projectsAll.filter((p) => p.published).sort(byOrderThenNewest('updated')),
    skills,
    education: single.education && {
      degrees: sortList(single.education.degrees),
      certifications: sortList(single.education.certifications),
      achievements: sortList(single.education.achievements),
    },
  };
  return { content, errors };
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
    '/about',
    '/contact',
  ];
}

/** REQ-SEO-002: sitemap.xml of the published routes on the production origin. */
export function sitemapXml(content) {
  const urls = siteRoutes(content)
    .map((route) => `  <url><loc>${content.site.url}${route}</loc></url>`)
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
    publicDir = DEFAULT_PUBLIC_DIR,
    log = console.log,
    error = console.error,
  } = {},
) {
  const { content, errors } = await buildContent();
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
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(content) + '\n');
  writeFileSync(join(publicDir, 'sitemap.xml'), sitemapXml(content));
  writeFileSync(join(publicDir, 'robots.txt'), robotsTxt(content));
  log(
    `build-content: wrote ${relative(process.cwd(), out).replace(/\\/g, '/')}, sitemap.xml and robots.txt`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
