// Runs as `postbuild`, first. Each prerendered page waits for two small files before it can paint: the theme
// script and the global stylesheet. On a slow mobile link these requests delay first paint by at least one round
// trip (they are fetched in parallel), so both are copied into the page: the stylesheet as <style>, the theme
// script as an inline <script>. emit-headers.mjs then puts their SHA-256 hashes in the CSP, so the policy still
// needs no 'unsafe-inline'. (Angular's critical-CSS inlining stays off. In Angular 22 it would split this
// stylesheet and load the rest with media="print" and one inline script; inlining the whole 11 KB stylesheet is
// simpler.)
// Usage: node scripts/inline-critical.mjs [distDir]   (default: dist/web)
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const THEME = /<script\s+src="theme-init\.js"\s*><\/script>/;
const SHEET = /<link\s+rel="stylesheet"\s+href="(styles-[\w-]+\.css)"\s*>/;

/** Returns the page with the theme script and the global stylesheet inline (unchanged if already inline). */
export function inlinePage(html, read) {
  let out = html;
  const theme = THEME.exec(out);
  if (theme) out = out.replace(THEME, () => `<script>${read('theme-init.js').trim()}</script>`);
  const sheet = SHEET.exec(out);
  // Font URLs are relative to the stylesheet; once inline they must not depend on <base href>.
  if (sheet) {
    const css = read(sheet[1])
      .trim()
      .replace(/url\((["']?)\.\/media\//g, 'url($1/media/');
    out = out.replace(SHEET, () => `<style>${css}</style>`);
  }
  return out;
}

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? htmlFiles(join(dir, e.name))
      : e.name.endsWith('.html')
        ? [join(dir, e.name)]
        : [],
  );
}

export function main(
  argv = process.argv.slice(2),
  { log = console.log, error = console.error } = {},
) {
  const browser = join(
    resolve(argv[0] ?? join(import.meta.dirname, '..', 'dist', 'web')),
    'browser',
  );
  if (!existsSync(browser)) {
    error(`inline-critical: ${browser} does not exist (run the build first)`);
    return 1;
  }
  const read = (name) => readFileSync(join(browser, name), 'utf8');
  let pages = 0;
  for (const file of htmlFiles(browser)) {
    const html = readFileSync(file, 'utf8');
    const out = inlinePage(html, read);
    if (out !== html) {
      writeFileSync(file, out);
      pages++;
    }
  }
  // The build must not silently ship the blocking requests again (Angular renames the stylesheet or the
  // index.html markup changes): fail if nothing was inlined or a page still points at either file.
  const left = htmlFiles(browser).filter((f) =>
    /theme-init\.js|href="styles-[\w-]+\.css"/.test(readFileSync(f, 'utf8')),
  );
  if (pages === 0 || left.length > 0) {
    error(
      pages === 0
        ? 'inline-critical: no page was inlined (the theme script and stylesheet tags were not found)'
        : `inline-critical: still references theme-init.js or the stylesheet: ${left.join(', ')}`,
    );
    return 1;
  }
  log(`inline-critical: ok (${pages} pages)`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main();
}
