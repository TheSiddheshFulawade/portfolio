// REQ-PAGE-001: runs as `postbuild`, before verify-prerender. Cloudflare Pages serves `404.html` (with status 404)
// for unknown paths, so copy the prerendered /404 route to browser/404.html. The client router then shows the
// same page for whatever URL was requested (the `**` route).
// Usage: node scripts/emit-404.mjs [distDir]   (default: dist/web)
import { copyFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const browser = join(
  resolve(process.argv[2] ?? join(import.meta.dirname, '..', 'dist', 'web')),
  'browser',
);
const source = join(browser, '404', 'index.html');

if (!existsSync(source)) {
  console.error(`emit-404: ${source} does not exist (the /404 route was not prerendered)`);
  process.exit(1);
}
copyFileSync(source, join(browser, '404.html'));
console.log('emit-404: ok');
