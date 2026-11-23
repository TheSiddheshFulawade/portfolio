// Repo policy check runner: runs every scripts/checks/*.mjs module (except tests) against the repo.
// Each module exports check(root): string[] (or a Promise of one). Fails closed: a module that
// cannot load, a missing checks dir, or finding no checks at all is an error.
import { realpathSync } from 'node:fs';
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
  let modules;
  try {
    modules = await discover(checksDir);
  } catch (err) {
    error(`check-repo: cannot read the checks dir ${checksDir}: ${err?.code ?? err?.message ?? err}`);
    return 1;
  }
  if (modules.length === 0) {
    error(`check-repo: no check modules found in ${checksDir}`);
    return 1;
  }
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

if (isEntryPoint(import.meta.url)) {
  process.exitCode = await main();
}

/**
 * True when this file is the script Node was started with. Compares real paths: Node resolves
 * import.meta.url through symlinks and junctions but leaves argv[1] as typed, so a plain string
 * compare would silently skip main() and exit 0 when the repo is opened through a link.
 */
function isEntryPoint(moduleUrl) {
  if (!process.argv[1]) return false;
  try {
    const norm = (p) => {
      const real = realpathSync.native(p);
      return process.platform === 'win32' ? real.toLowerCase() : real;
    };
    return norm(process.argv[1]) === norm(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}
