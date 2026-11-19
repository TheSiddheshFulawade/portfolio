// Static server for the smoke test (REQ-PAGE-001). Serves dist/web/browser the way Cloudflare Pages does:
// /path, then /path/index.html, else 404.html with status 404. Test-only; never deployed.
// Usage: node e2e/serve.mjs [port]   (default 4310)
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

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

async function file(path) {
  try {
    return (await stat(path)).isFile() ? path : undefined;
  } catch {
    return undefined;
  }
}

createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  const safe = normalize(join(root, pathname));
  const found = safe.startsWith(root)
    ? ((await file(safe)) ?? (await file(join(safe, 'index.html'))))
    : undefined;
  const path = found ?? join(root, '404.html');
  res.writeHead(found ? 200 : 404, {
    'content-type': TYPES[extname(path)] ?? 'application/octet-stream',
  });
  res.end(await readFile(path));
}).listen(port, () => console.log(`e2e/serve: http://localhost:${port}`));
