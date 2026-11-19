// Spec 003 V11-02 (REQ-SEC-001): runs as `postbuild`, after emit-404. Writes dist/web/browser/_headers for
// Cloudflare Pages with the security header set and a hash-based Content Security Policy: every inline <script>
// (Angular's hydration event-replay contract) and inline <style> (prerendered component styles) found in any
// built page is allowed by its SHA-256 hash, so the policy needs no 'unsafe-inline' or 'unsafe-eval'.
// Usage: node scripts/emit-headers.mjs [distDir]   (default: dist/web)
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Third-party origins: Cloudflare Web Analytics (REQ-ANA-001), injected by Pages on production only. */
const ANALYTICS_SCRIPT = 'https://static.cloudflareinsights.com';
const ANALYTICS_BEACON = 'https://cloudflareinsights.com';

/** Cloudflare Pages limit for one `_headers` line. */
export const MAX_LINE = 2000;

const hash = (text) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

/** CSP hashes of the inline scripts and styles in one HTML page. External and JSON data scripts are skipped. */
export function inlineHashes(html) {
  const scripts = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1];
    if (/\bsrc\s*=/i.test(attrs) || /\btype\s*=\s*["']?application\/(ld\+)?json/i.test(attrs))
      continue;
    if (m[2].length > 0) scripts.push(hash(m[2]));
  }
  const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .filter((m) => m[1].length > 0)
    .map((m) => hash(m[1]));
  return { scripts, styles };
}

/** The header set for every path. Hash lists are de-duplicated and sorted so the output is stable. */
export function buildHeaders({ scripts, styles }) {
  const list = (items) => [...new Set(items)].sort().join(' ');
  const csp = [
    "default-src 'self'",
    `script-src 'self' ${list(scripts)} ${ANALYTICS_SCRIPT}`.replace(/\s+/g, ' '),
    `style-src 'self' ${list(styles)}`.replace(/\s+/g, ' ').trim(),
    "img-src 'self'",
    "font-src 'self'",
    `connect-src 'self' ${ANALYTICS_BEACON}`,
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
  return {
    'Content-Security-Policy': csp,
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy':
      'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), browsing-topics=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-site',
  };
}

/** Cloudflare Pages `_headers` text: a path pattern, then indented `Name: value` lines. */
export function formatHeaders(headers) {
  const lines = Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`);
  return `/*\n${lines.join('\n')}\n`;
}

/** Inverse of formatHeaders, for tests and the smoke-test server: { '/*': { Name: value } }. */
export function parseHeaders(text) {
  const rules = {};
  let current;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = rules[line.trim()] = {};
    } else if (current) {
      const i = line.indexOf(':');
      current[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return rules;
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
    error(`emit-headers: ${browser} does not exist (run the build first)`);
    return 1;
  }
  const scripts = [];
  const styles = [];
  for (const file of htmlFiles(browser)) {
    const found = inlineHashes(readFileSync(file, 'utf8'));
    scripts.push(...found.scripts);
    styles.push(...found.styles);
  }
  const headers = buildHeaders({ scripts, styles });
  // Cloudflare Pages ignores `_headers` lines longer than 2,000 characters, which would drop the CSP silently.
  for (const [name, value] of Object.entries(headers)) {
    const length = `  ${name}: ${value}`.length;
    if (length > MAX_LINE) {
      error(
        `emit-headers: the ${name} line is ${length.toLocaleString('en')} characters, over the ` +
          `${MAX_LINE.toLocaleString('en')} Cloudflare Pages limit. Reduce inline styles or move the CSP to a meta tag.`,
      );
      return 1;
    }
  }
  writeFileSync(join(browser, '_headers'), formatHeaders(headers));
  log(
    `emit-headers: ok (${new Set(scripts).size} script and ${new Set(styles).size} style hashes)`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main();
}
