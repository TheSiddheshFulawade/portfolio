// Static server for the smoke test (REQ-PAGE-001). Serves dist/web/browser the way Cloudflare Pages does:
// /path, then /path/index.html, else 404.html with status 404, with the headers from the built `_headers` file
// (so the smoke test runs with the CSP enforced, spec 003 V11-02). Test-only; never deployed.
// Usage: node e2e/serve.mjs [port]   (default 4310)
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { parseHeaders } from '../scripts/emit-headers.mjs';

const root = resolve(import.meta.dirname, '..', 'dist', 'web', 'browser');
const port = Number(process.argv[2] ?? 4310);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
};

if (!existsSync(join(root, '404.html'))) {
  console.error(`e2e/serve: ${root} has no 404.html. Run "npm run build" first.`);
  process.exit(1);
}

// Only the catch-all rule is written by emit-headers.mjs; apply it to every response.
const headersFile = join(root, '_headers');
const securityHeaders = existsSync(headersFile)
  ? (parseHeaders(await readFile(headersFile, 'utf8'))['/*'] ?? {})
  : {};

async function file(path) {
  try {
    return (await stat(path)).isFile() ? path : undefined;
  } catch {
    return undefined;
  }
}

/** Stand-in for the visitor counter Pages Function (spec 003 V11-03), which this static server cannot run. */
export const STUB_TOTALS = { total: 4218, today: 37 };

createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  if (pathname === '/api/visits') {
    res.writeHead(200, {
      ...securityHeaders,
      'content-type': 'application/json',
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify(STUB_TOTALS));
    return;
  }
  const safe = normalize(join(root, pathname));
  const found = safe.startsWith(root)
    ? ((await file(safe)) ?? (await file(join(safe, 'index.html'))))
    : undefined;
  const path = found ?? join(root, '404.html');
  res.writeHead(found ? 200 : 404, {
    ...securityHeaders,
    'content-type': TYPES[extname(path)] ?? 'application/octet-stream',
  });
  res.end(await readFile(path));
}).listen(port, () => console.log(`e2e/serve: http://localhost:${port}`));
