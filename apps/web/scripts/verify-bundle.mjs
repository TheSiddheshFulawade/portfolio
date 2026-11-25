// REQ-PERF-101: runs as `postbuild`. Fails the build when page-only data (decisions, measured results,
// project bodies) ended up in main-*.js, which every visitor downloads. Those datasets reach the browser only
// through page chunks (src/app/core/content/home-content.ts, results-content.ts, project-bodies.ts).
// Usage: node scripts/verify-bundle.mjs [distDir]   (default: dist/web)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = import.meta.dirname;
const GENERATED = join(HERE, '..', 'src', 'generated');

/** A plain-ASCII, quote-free stretch of text that survives minifying and escaping verbatim. */
function sample(text) {
  const run = /[A-Za-z0-9 ,.()-]{32,}/.exec(String(text).replace(/<[^>]+>/g, ' '));
  return run ? run[0].trim().slice(0, 48) : undefined;
}

/** Page-only samples: one decision, one measured result, one project body. */
export function pageOnlySamples(generated) {
  const out = [];
  const decision = generated.home?.decisions?.[0];
  if (decision) out.push(['decisions', sample(decision.reason)]);
  const result = Object.values(generated.results ?? {})[0];
  if (result) out.push(['results', sample(result.workload)]);
  const body = Object.values(generated.bodies ?? {})[0];
  if (body) out.push(['project bodies', sample(body)]);
  return out.filter(([, text]) => text);
}

/** Names of the datasets whose sample text appears in the main bundle source. */
export function leaks(mainSource, generated) {
  return pageOnlySamples(generated)
    .filter(([, text]) => mainSource.includes(text))
    .map(([name]) => name);
}

export function main(distArg = process.argv[2]) {
  const dist = resolve(distArg ?? join(HERE, '..', 'dist', 'web'));
  const browser = join(dist, 'browser');
  const mains = existsSync(browser)
    ? readdirSync(browser).filter((f) => /^main-.*\.js$/.test(f))
    : [];
  if (mains.length !== 1) {
    console.error(`verify-bundle: expected one main-*.js in ${browser}, found ${mains.length}`);
    return 1;
  }
  const read = (name) => JSON.parse(readFileSync(join(GENERATED, `${name}.json`), 'utf8'));
  const generated = { home: read('home'), results: read('results'), bodies: read('bodies') };
  const found = leaks(readFileSync(join(browser, mains[0]), 'utf8'), generated);
  if (found.length) {
    console.error(
      `verify-bundle: ${found.join(', ')} found in ${mains[0]}; import them from page components only`,
    );
    return 1;
  }
  console.log('verify-bundle: ok');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
