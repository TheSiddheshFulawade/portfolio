// Stop: run fast checks for the parts of the repo that changed.
// Exit 2 sends the failures back to Claude so it fixes them before finishing.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readInput, exists, ROOT } from './lib.mjs';

const input = await readInput();
if (input?.stop_hook_active) process.exit(0); // already fixing a gate failure; avoid loops

const sh = (cmd, args, cwd = ROOT) =>
  spawnSync(cmd, args, { cwd, shell: process.platform === 'win32', encoding: 'utf8', timeout: 240_000 });

const status = sh('git', ['status', '--porcelain']);
if (status.status !== 0) process.exit(0);
const changed = status.stdout.split('\n').filter(Boolean).map((l) => l.slice(3).replace(/\\/g, '/'));
if (!changed.length) process.exit(0);

const failures = [];
const scripts = (pkgDir) => {
  try {
    return JSON.parse(readFileSync(resolve(ROOT, pkgDir, 'package.json'), 'utf8')).scripts ?? {};
  } catch {
    return {};
  }
};

// Web
if (changed.some((f) => f.startsWith('apps/web/')) && exists('apps/web/package.json')) {
  const s = scripts('apps/web');
  for (const name of ['typecheck', 'lint']) {
    if (!s[name]) continue;
    const r = sh('npm', ['run', '-s', name], resolve(ROOT, 'apps/web'));
    if (r.status !== 0) failures.push(`web ${name} failed:\n${(r.stdout + r.stderr).slice(-3000)}`);
  }
}

// API
if (changed.some((f) => f.startsWith('apps/api/')) && exists('apps/api/pom.xml')) {
  const mvnw = process.platform === 'win32' ? 'mvnw.cmd' : './mvnw';
  const r = sh(mvnw, ['-q', '-DskipTests', 'compile'], resolve(ROOT, 'apps/api'));
  if (r.status !== 0) failures.push(`api compile failed:\n${(r.stdout + r.stderr).slice(-3000)}`);
}

// Content
if (changed.some((f) => f.startsWith('content/')) && exists('scripts/validate-content.mjs')) {
  const r = sh('node', ['scripts/validate-content.mjs']);
  if (r.status !== 0) failures.push(`content validation failed:\n${(r.stdout + r.stderr).slice(-3000)}`);
}

// Never let personal documents become tracked.
const tracked = sh('git', ['ls-files', 'docs/private']);
if (tracked.stdout.trim()) failures.push(`docs/private files are tracked by git:\n${tracked.stdout}`);

if (failures.length) {
  process.stderr.write(`[quality-gate] Fix these before finishing:\n\n${failures.join('\n\n')}\n`);
  process.exit(2);
}
process.exit(0);
