// REQ-WEB-002 / REQ-WEB-001: runs as `postbuild`. Fails the build unless the static output has a prerendered
// browser/index.html with a non-empty <h1> inside <sf-root>, and no server bundle (server.mjs) was emitted.
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
const index = join(dist, 'browser', 'index.html');
if (!existsSync(index)) {
  errors.push(`${index} does not exist (the route was not prerendered)`);
} else {
  const html = readFileSync(index, 'utf8');
  const root = /<sf-root\b[^>]*>([\s\S]*?)<\/sf-root>/.exec(html);
  if (!root || !/<h1\b[^>]*>\s*[^<\s][\s\S]*?<\/h1>/.test(root[1])) {
    errors.push(`${index} has no non-empty <h1> inside <sf-root>`);
  }
}
for (const server of find(dist, 'server.mjs'))
  errors.push(`${server} was emitted (output must be static, no server)`);

if (errors.length > 0) {
  for (const error of errors) console.error(`verify-prerender: ${error}`);
  process.exit(1);
}
console.log('verify-prerender: ok');
