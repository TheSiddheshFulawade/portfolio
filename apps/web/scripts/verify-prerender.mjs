// REQ-WEB-002 / REQ-WEB-001 / REQ-PAGE-001: runs as `postbuild`. Fails the build unless the static output has prerendered
// pages (home, experience, projects, the Settlement Lab page, about, contact, 404) with a non-empty <h1> inside <sf-root>, and no server bundle (server.mjs) was emitted.
// Usage: node scripts/verify-prerender.mjs [distDir]   (default: dist/web)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dist = resolve(process.argv[2] ?? join(import.meta.dirname, '..', 'dist', 'web'));

function find(dir, name) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? find(join(dir, entry.name), name)
      : entry.name === name
        ? [join(dir, entry.name)]
        : [],
  );
}

const errors = [];
// Every prerendered page that must exist, relative to dist/web/browser (REQ-PAGE-001).
const PAGES = [
  'index.html',
  'experience/index.html',
  'projects/index.html',
  'projects/settlement-lab/index.html',
  'about/index.html',
  'contact/index.html',
  '404.html',
];
for (const page of PAGES) {
  const file = join(dist, 'browser', page);
  if (!existsSync(file)) {
    errors.push(`${file} does not exist (the route was not prerendered)`);
    continue;
  }
  const html = readFileSync(file, 'utf8');
  const root = /<sf-root\b[^>]*>([\s\S]*?)<\/sf-root>/.exec(html);
  if (!root || !/<h1\b[^>]*>\s*[^<\s][\s\S]*?<\/h1>/.test(root[1])) {
    errors.push(`${file} has no non-empty <h1> inside <sf-root>`);
  }
}
// REQ-SEC-001: the Settlement Lab board is prerendered (incremental hydration), so its component styles are in the
// HTML and hashed into the CSP. A board that only appears at runtime would have its styles blocked.
const projects = join(dist, 'browser', 'projects/index.html');
if (existsSync(projects)) {
  const html = readFileSync(projects, 'utf8');
  if (!/<sf-settlement-board[\s\S]*?<select[\s\S]*?<select[\s\S]*?<button/.test(html))
    errors.push(
      `${projects} does not contain the prerendered Settlement Lab board (selects and Run button)`,
    );
}
for (const server of find(dist, 'server.mjs'))
  errors.push(`${server} was emitted (output must be static, no server)`);

if (errors.length > 0) {
  for (const error of errors) console.error(`verify-prerender: ${error}`);
  process.exit(1);
}
console.log('verify-prerender: ok');
