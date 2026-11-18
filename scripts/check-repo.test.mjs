import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const load = () => import('./check-repo.mjs');

async function makeChecksDir(files) {
  const dir = await mkdtemp(path.join(tmpdir(), 'check-repo-'));
  for (const [name, body] of Object.entries(files)) {
    await writeFile(path.join(dir, name), body);
  }
  return dir;
}

const PASS = 'export function check() { return []; }\n';
const FAIL = 'export function check() { return ["first problem", "second problem"]; }\n';
const ASYNC_FAIL = 'export async function check() { return ["async problem"]; }\n';
const THROWS_ON_IMPORT = 'throw new Error("must not be imported");\n';
const NO_CHECK = 'export const other = 1;\n';

function capture() {
  const logs = [];
  const errors = [];
  return { logs, errors, log: (m) => logs.push(String(m)), error: (m) => errors.push(String(m)) };
}

test('REQ-REPO-002 check-repo discovers *.mjs directly in the checks dir and excludes *.test.mjs, sorted by name', async () => {
  const { discover } = await load();
  const dir = await makeChecksDir({
    'b-check.mjs': PASS,
    'a-check.mjs': PASS,
    'c-check.mjs': PASS,
    'a-check.test.mjs': THROWS_ON_IMPORT,
    'notes.txt': 'x',
    'readme.md': 'x',
  });
  try {
    const found = await discover(dir);
    assert.deepEqual(found.map((p) => path.basename(p)), ['a-check.mjs', 'b-check.mjs', 'c-check.mjs']);
    for (const p of found) assert.ok(path.isAbsolute(p), `${p} must be absolute`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('REQ-REPO-002 check-repo does not descend into subdirectories', async () => {
  const { discover } = await load();
  const dir = await makeChecksDir({ 'top.mjs': PASS });
  await mkdir(path.join(dir, 'nested'));
  await writeFile(path.join(dir, 'nested', 'deep.mjs'), PASS);
  try {
    const found = await discover(dir);
    assert.deepEqual(found.map((p) => path.basename(p)), ['top.mjs']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('REQ-REPO-002 check-repo prints each error prefixed with the module name and exits 1', async () => {
  const { main } = await load();
  const dir = await makeChecksDir({
    'good.mjs': PASS,
    'bad.mjs': FAIL,
    'skipped.test.mjs': THROWS_ON_IMPORT,
  });
  const c = capture();
  try {
    const code = await main({ root: dir, checksDir: dir, log: c.log, error: c.error });
    assert.equal(code, 1);
    assert.deepEqual(c.errors, ['bad: first problem', 'bad: second problem']);
    assert.equal(c.logs.length, 1, 'exactly one summary line');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('REQ-REPO-002 check-repo exits 0 and prints no errors when every module passes', async () => {
  const { main } = await load();
  const dir = await makeChecksDir({ 'one.mjs': PASS, 'two.mjs': PASS, 'x.test.mjs': THROWS_ON_IMPORT });
  const c = capture();
  try {
    const code = await main({ root: dir, checksDir: dir, log: c.log, error: c.error });
    assert.equal(code, 0);
    assert.deepEqual(c.errors, []);
    assert.equal(c.logs.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('REQ-REPO-002 check-repo awaits async check functions', async () => {
  const { main } = await load();
  const dir = await makeChecksDir({ 'later.mjs': ASYNC_FAIL });
  const c = capture();
  try {
    const code = await main({ root: dir, checksDir: dir, log: c.log, error: c.error });
    assert.equal(code, 1);
    assert.deepEqual(c.errors, ['later: async problem']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('REQ-REPO-002 check-repo passes the root to each check', async () => {
  const { main } = await load();
  const dir = await makeChecksDir({
    'echo-root.mjs': 'export function check(root) { return ["root=" + root]; }\n',
  });
  const c = capture();
  const fakeRoot = path.join(tmpdir(), 'some-root');
  try {
    await main({ root: fakeRoot, checksDir: dir, log: c.log, error: c.error });
    assert.deepEqual(c.errors, [`echo-root: root=${fakeRoot}`]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('REQ-REPO-002 check-repo fails closed on a module without a check export', async () => {
  const { main } = await load();
  const dir = await makeChecksDir({ 'nocheck.mjs': NO_CHECK });
  const c = capture();
  try {
    const code = await main({ root: dir, checksDir: dir, log: c.log, error: c.error });
    assert.equal(code, 1);
    assert.equal(c.errors.length, 1);
    assert.ok(c.errors[0].startsWith('nocheck: '), c.errors[0]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('REQ-REPO-002 check-repo fails closed on a module whose import throws, and still runs the others', async () => {
  const { main } = await load();
  const dir = await makeChecksDir({ 'broken.mjs': THROWS_ON_IMPORT, 'zfail.mjs': FAIL });
  const c = capture();
  try {
    const code = await main({ root: dir, checksDir: dir, log: c.log, error: c.error });
    assert.equal(code, 1);
    assert.ok(c.errors.some((e) => e.startsWith('broken: ')), JSON.stringify(c.errors));
    assert.ok(c.errors.includes('zfail: first problem'), 'later modules still run');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('REQ-REPO-002 check-repo with a mix of passing, failing and broken modules exits 1', async () => {
  const { main } = await load();
  const dir = await makeChecksDir({
    'good.mjs': PASS,
    'bad.mjs': FAIL,
    'nocheck.mjs': NO_CHECK,
    'x.test.mjs': THROWS_ON_IMPORT,
  });
  const c = capture();
  try {
    const code = await main({ root: dir, checksDir: dir, log: c.log, error: c.error });
    assert.equal(code, 1);
    assert.equal(c.errors.length, 3, JSON.stringify(c.errors));
    assert.ok(!c.errors.some((e) => e.startsWith('good:') || e.startsWith('x.test')));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('REQ-REPO-002 check-repo fails closed when no check modules are found', async () => {
  const { main } = await load();
  const dir = await makeChecksDir({ 'only.test.mjs': THROWS_ON_IMPORT });
  const c = capture();
  try {
    assert.equal(await main({ root: dir, checksDir: dir, log: c.log, error: c.error }), 1);
    assert.ok(c.errors.some((e) => /no check modules/.test(e)), JSON.stringify(c.errors));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('REQ-REPO-002 check-repo reports a missing checks dir as an error, not a crash', async () => {
  const { main } = await load();
  const dir = await mkdtemp(path.join(tmpdir(), 'check-repo-'));
  const c = capture();
  try {
    assert.equal(await main({ root: dir, checksDir: path.join(dir, 'missing'), log: c.log, error: c.error }), 1);
    assert.ok(c.errors.some((e) => /checks dir/.test(e)), JSON.stringify(c.errors));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('REQ-REPO-002 check-repo CLI runs the checks, also when started through a symlink or junction', async () => {
  const fs = await import('node:fs');
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const root = await mkdtemp(path.join(tmpdir(), 'check-repo-cli-'));
  const linkParent = await mkdtemp(path.join(tmpdir(), 'check-repo-link-'));
  const link = path.join(linkParent, 'scripts');
  try {
    await mkdir(path.join(root, 'scripts', 'checks'), { recursive: true });
    fs.copyFileSync(path.join(repoRoot, 'scripts', 'check-repo.mjs'), path.join(root, 'scripts', 'check-repo.mjs'));
    await writeFile(path.join(root, 'scripts', 'checks', 'bad.mjs'), FAIL);
    fs.symlinkSync(path.join(root, 'scripts'), link, process.platform === 'win32' ? 'junction' : 'dir');
    for (const script of [path.join(root, 'scripts', 'check-repo.mjs'), path.join(link, 'check-repo.mjs')]) {
      const res = spawnSync(process.execPath, [script], { encoding: 'utf8' });
      assert.equal(res.status, 1, `${script}: a silent exit 0 means the entry guard failed`);
      assert.match(res.stderr, /^bad: first problem$/m);
    }
  } finally {
    if (fs.existsSync(link)) fs.unlinkSync(link);
    await rm(linkParent, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});
