import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const load = () => import('./mvnw.mjs');
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const mvnwScript = path.join(repoRoot, 'scripts', 'mvnw.mjs').replaceAll('\\', '/');

const CONTRACT_ARGS = [
  '-B', '-ntp', '-q', '-DskipTests', '-Dspotless.check.skip=true',
  'test-compile', 'spotless:check', 'spotless:apply', 'verify', 'package',
];

test('REQ-REPO-002 mvnw accepts every argument in the root script contract', async () => {
  const { validateArgs } = await load();
  for (const arg of CONTRACT_ARGS) {
    assert.equal(validateArgs([arg]), null, `${arg} must pass`);
  }
  assert.equal(validateArgs(CONTRACT_ARGS), null);
  assert.equal(validateArgs([]), null);
});

const REJECTED = [
  ['%', '-Dx=a%b'],
  ['^', '-Dx=a^b'],
  ['&', '-Dx=a&b'],
  ['|', '-Dx=a|b'],
  ['<', '-Dx=a<b'],
  ['>', '-Dx=a>b'],
  ['"', '-Dx=a"b'],
  ["'", "-Dx=a'b"],
  ['!', '-Dx=a!b'],
  ['(', '-Dx=a(b'],
  [')', '-Dx=a)b'],
  [';', '-Dx=a;b'],
  ['backtick', '-Dx=a`b'],
  ['space', '-Dx=a b'],
  ['tab', '-Dx=a\tb'],
  ['CR', '-Dx=a\rb'],
  ['LF', '-Dx=a\nb'],
  ['non-ASCII', '-Dx=aéb'],
  ['empty string', ''],
  ['NUL', '-Dx=a\0b'],
  ['trailing LF', 'verify\n'],
  ['fullwidth percent', '-Dx=％PATH％'],
  ['fullwidth quote', '-Dx=a＂b'],
  ['leading @', '@args.txt'],
];

for (const [label, arg] of REJECTED) {
  test(`REQ-REPO-002 mvnw rejects ${label}`, async () => {
    const { validateArgs } = await load();
    assert.equal(validateArgs(['-B', arg, 'verify']), arg);
  });
}

test('REQ-REPO-002 mvnw rejects non-string arguments', async () => {
  const { validateArgs } = await load();
  for (const arg of [123, null, undefined, new String('verify'), ['verify'], { toString: () => 'verify' }]) {
    assert.equal(validateArgs([arg]), arg, `${String(arg)} must be rejected`);
  }
});

test('REQ-REPO-002 mvnw rejects an argument that starts with a character outside the allowed lead set', async () => {
  const { validateArgs } = await load();
  for (const arg of ['---x', '-', '--', '_x', '.x', '/x', '=x', '-%x']) {
    assert.equal(validateArgs([arg]), arg, `${arg} must be rejected`);
  }
});

test('REQ-REPO-002 mvnw reports the first rejected argument', async () => {
  const { validateArgs } = await load();
  assert.equal(validateArgs(['verify', 'a&b', 'c|d']), 'a&b');
});

test('REQ-REPO-002 mvnw buildSpawn on win32 is one command string through a shell with no args array', async () => {
  const { buildSpawn } = await load();
  const spawnSpec = buildSpawn('win32', ['-B', '-ntp', 'verify'], repoRoot);
  assert.equal(spawnSpec.command, '.\\mvnw.cmd -B -ntp verify');
  assert.deepEqual(spawnSpec.args, []);
  assert.equal(spawnSpec.options.shell, true);
  assert.equal(path.resolve(spawnSpec.options.cwd), path.resolve(repoRoot, 'apps/api'));
});

test('REQ-REPO-002 mvnw buildSpawn on win32 with no args is just the wrapper', async () => {
  const { buildSpawn } = await load();
  assert.equal(buildSpawn('win32', [], repoRoot).command, '.\\mvnw.cmd');
});

test('REQ-REPO-002 mvnw buildSpawn on linux is ./mvnw with an args array and no shell', async () => {
  const { buildSpawn } = await load();
  const args = ['-B', '-ntp', 'verify'];
  const spawnSpec = buildSpawn('linux', args, repoRoot);
  assert.equal(spawnSpec.command, './mvnw');
  assert.deepEqual(spawnSpec.args, args);
  assert.equal(spawnSpec.options.shell, false);
  assert.equal(path.resolve(spawnSpec.options.cwd), path.resolve(repoRoot, 'apps/api'));
});

test('REQ-REPO-002 mvnw buildSpawn treats darwin like linux', async () => {
  const { buildSpawn } = await load();
  const spawnSpec = buildSpawn('darwin', ['-q'], repoRoot);
  assert.equal(spawnSpec.command, './mvnw');
  assert.equal(spawnSpec.options.shell, false);
});

function stubSpawn({ code = 0, event = 'close', signalCode = null } = {}) {
  const calls = [];
  const spawn = (command, args, options) => {
    calls.push({ command, args, options });
    return {
      on(name, cb) {
        if (name === event) setImmediate(() => (event === 'error' ? cb(new Error('boom')) : cb(code, signalCode)));
        return this;
      },
    };
  };
  return { spawn, calls };
}

function stderrSink() {
  const chunks = [];
  return { chunks, write: (s) => { chunks.push(String(s)); return true; } };
}

test('REQ-REPO-002 mvnw forwards arguments and the child exit code on linux', async () => {
  const { main } = await load();
  for (const code of [0, 3]) {
    const { spawn, calls } = stubSpawn({ code });
    const stderr = stderrSink();
    const result = await main(['-B', '-ntp', 'verify'], { platform: 'linux', spawn, root: repoRoot, stderr });
    assert.equal(result, code);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, './mvnw');
    assert.deepEqual(calls[0].args, ['-B', '-ntp', 'verify']);
    assert.equal(calls[0].options.stdio, 'inherit');
    assert.equal(calls[0].options.shell, false);
    assert.equal(path.resolve(calls[0].options.cwd), path.resolve(repoRoot, 'apps/api'));
    assert.deepEqual(stderr.chunks, []);
  }
});

test('REQ-REPO-002 mvnw forwards arguments and the child exit code on win32', async () => {
  const { main } = await load();
  const { spawn, calls } = stubSpawn({ code: 3 });
  const result = await main(['-B', 'spotless:check'], { platform: 'win32', spawn, root: repoRoot, stderr: stderrSink() });
  assert.equal(result, 3);
  assert.equal(calls[0].command, '.\\mvnw.cmd -B spotless:check');
  assert.deepEqual(calls[0].args, []);
  assert.equal(calls[0].options.shell, true);
  assert.equal(calls[0].options.stdio, 'inherit');
});

test('REQ-REPO-002 mvnw exits 1 when the child reports a null exit code', async () => {
  const { main } = await load();
  const { spawn } = stubSpawn({ code: null });
  assert.equal(await main(['verify'], { platform: 'linux', spawn, root: repoRoot, stderr: stderrSink() }), 1);
});

test('REQ-REPO-002 mvnw exits 1 when the spawn emits an error event', async () => {
  const { main } = await load();
  const { spawn } = stubSpawn({ event: 'error' });
  assert.equal(await main(['verify'], { platform: 'linux', spawn, root: repoRoot, stderr: stderrSink() }), 1);
});

test('REQ-REPO-002 mvnw names a missing apps/api instead of a bare spawn error', async () => {
  const { main } = await load();
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const root = mkdtempSync(path.join(tmpdir(), 'mvnw-noapi-'));
  try {
    const spawn = () => ({
      on(name, cb) {
        if (name === 'error') setImmediate(() => cb(Object.assign(new Error('spawn cmd.exe ENOENT'), { code: 'ENOENT' })));
        return this;
      },
    });
    const stderr = stderrSink();
    assert.equal(await main(['verify'], { platform: 'win32', spawn, root, stderr }), 1);
    assert.match(stderr.chunks.join(''), /apps\/api not found/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('REQ-REPO-002 mvnw spawns nothing and exits 2 on a rejected argument', async () => {
  const { main } = await load();
  for (const platform of ['win32', 'linux']) {
    const { spawn, calls } = stubSpawn({ code: 0 });
    const stderr = stderrSink();
    const result = await main(['-B', 'a%b', 'verify'], { platform, spawn, root: repoRoot, stderr });
    assert.equal(result, 2, platform);
    assert.equal(calls.length, 0, `${platform}: spawn must not be called`);
    assert.equal(stderr.chunks.join(''), 'mvnw.mjs: rejected argument "a%b"\n');
  }
});

test('REQ-REPO-002 mvnw JSON-escapes the rejected argument in the message', async () => {
  const { main } = await load();
  const { spawn, calls } = stubSpawn();
  const stderr = stderrSink();
  const result = await main(['x\ny'], { platform: 'linux', spawn, root: repoRoot, stderr });
  assert.equal(result, 2);
  assert.equal(calls.length, 0);
  assert.equal(stderr.chunks.join(''), 'mvnw.mjs: rejected argument "x\\ny"\n');
});

test('REQ-REPO-002 mvnw CLI exits 2 with the rejection message and spawns nothing', () => {
  const res = spawnSync(process.execPath, [mvnwScript, 'a%b'], { encoding: 'utf8', cwd: repoRoot });
  assert.equal(res.status, 2, `stderr: ${res.stderr}`);
  assert.equal(res.stderr, 'mvnw.mjs: rejected argument "a%b"\n');
  assert.equal(res.stdout, '');
});

// CLI tests on a copied layout (<tmp>/scripts/mvnw.mjs), so the real repo's apps/api is never run.
async function cliLayout({ wrapper = false } = {}) {
  const fs = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const root = fs.mkdtempSync(path.join(tmpdir(), 'mvnw-cli-'));
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.copyFileSync(path.join(repoRoot, 'scripts', 'mvnw.mjs'), path.join(root, 'scripts', 'mvnw.mjs'));
  if (wrapper) {
    const api = path.join(root, 'apps', 'api');
    fs.mkdirSync(api, { recursive: true });
    // Stub wrappers print exactly what they received, to prove that joining on win32 is exact.
    fs.writeFileSync(path.join(api, 'mvnw.cmd'), '@echo off\r\necho ARGS=%*\r\nexit /b 7\r\n');
    fs.writeFileSync(path.join(api, 'mvnw'), '#!/bin/sh\necho "ARGS=$*"\nexit 7\n', { mode: 0o755 });
  }
  const link = path.join(fs.mkdtempSync(path.join(tmpdir(), 'mvnw-link-')), 'scripts');
  fs.symlinkSync(path.join(root, 'scripts'), link, process.platform === 'win32' ? 'junction' : 'dir');
  const cleanup = () => {
    fs.unlinkSync(link);
    fs.rmSync(path.dirname(link), { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  };
  return { script: path.join(root, 'scripts', 'mvnw.mjs'), linked: path.join(link, 'mvnw.mjs'), cleanup };
}

test('REQ-REPO-002 mvnw CLI reaches the spawn path for valid arguments (exit 1, apps/api not found)', async () => {
  const l = await cliLayout();
  try {
    const res = spawnSync(process.execPath, [l.script, '-B', 'verify'], { encoding: 'utf8' });
    assert.equal(res.status, 1, `stderr: ${res.stderr}`);
    assert.match(res.stderr, /apps\/api not found/);
    assert.doesNotMatch(res.stderr, /DEP0190/);
  } finally {
    l.cleanup();
  }
});

test('REQ-REPO-002 mvnw CLI still runs when started through a symlink or junction', async () => {
  const l = await cliLayout();
  try {
    const rejected = spawnSync(process.execPath, [l.linked, 'a%b'], { encoding: 'utf8' });
    assert.equal(rejected.status, 2, `a silent exit 0 means the entry guard failed: ${rejected.stderr}`);
    const valid = spawnSync(process.execPath, [l.linked, 'verify'], { encoding: 'utf8' });
    assert.equal(valid.status, 1);
    assert.match(valid.stderr, /apps\/api not found/);
  } finally {
    l.cleanup();
  }
});

test('REQ-REPO-002 mvnw passes the contract arguments to the wrapper unchanged and forwards its exit code', async () => {
  const l = await cliLayout({ wrapper: true });
  try {
    const args = ['-B', '-ntp', '-Dspotless.check.skip=true', '-Da=b,c+d@e/f:g', 'spotless:check', 'verify'];
    const res = spawnSync(process.execPath, [l.script, ...args], { encoding: 'utf8' });
    assert.equal(res.status, 7, `stderr: ${res.stderr}`);
    assert.equal(res.stdout.trim(), `ARGS=${args.join(' ')}`);
    assert.doesNotMatch(res.stderr, /DEP0190/);
  } finally {
    l.cleanup();
  }
});
