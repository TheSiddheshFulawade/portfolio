// Repo policy check runner: runs every scripts/checks/*.mjs module (except tests) against the repo.
// Each module exports check(root): string[] (or a Promise of one). Fails closed on broken modules.
import { readdir } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function discover(checksDir) {
  const entries = await readdir(checksDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.mjs') && !e.name.endsWith('.test.mjs'))
    .map((e) => e.name)
    .sort()
    .map((name) => resolve(checksDir, name));
}

export async function main({
  root = ROOT,
  checksDir = join(root, 'scripts', 'checks'),
  log = console.log,
  error = console.error,
} = {}) {
  const modules = await discover(checksDir);
  let failures = 0;
  for (const file of modules) {
    const name = basename(file, '.mjs');
    let errors;
    try {
      const mod = await import(pathToFileURL(file).href);
      if (typeof mod.check !== 'function') throw new Error('module has no check(root) export');
      errors = await mod.check(root);
      if (!Array.isArray(errors)) throw new Error('check(root) did not return an array');
    } catch (err) {
      errors = [`check failed to run: ${err?.message ?? err}`];
    }
    for (const message of errors) error(`${name}: ${message}`);
    failures += errors.length;
  }
  log(
    failures
      ? `check:repo: ${failures} error(s) in ${modules.length} check(s)`
      : `check:repo: ${modules.length} check(s) passed`,
  );
  return failures ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
