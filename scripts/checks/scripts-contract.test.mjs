import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const load = () => import('./scripts-contract.mjs');

const EXPECTED_REQUIRED = [
  'install:web', 'lint:web', 'format:check:web', 'typecheck:web', 'test:web', 'build:web', 'audit:web',
  'format:web', 'test:hooks', 'test:scripts', 'check:repo',
  'lint', 'format:check', 'typecheck', 'test', 'build', 'audit', 'verify',
];

function goodManifest(overrides = {}) {
  const scripts = Object.fromEntries(EXPECTED_REQUIRED.map((n) => [n, 'node -e "0"']));
  return { name: 'portfolio-root', private: true, scripts, ...overrides };
}

async function fixture(manifest, { raw, lockfile = false } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'scripts-contract-'));
  if (raw !== undefined) await writeFile(path.join(dir, 'package.json'), raw);
  else if (manifest !== null) await writeFile(path.join(dir, 'package.json'), JSON.stringify(manifest, null, 2));
  if (lockfile) await writeFile(path.join(dir, 'package-lock.json'), '{}');
  return dir;
}

async function errorsFor(manifest, opts) {
  const { check } = await load();
  const dir = await fixture(manifest, opts);
  try {
    return await check(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const joined = (errs) => errs.join('\n');

test('REQ-REPO-002 root package.json defines lint, format:check, typecheck, test, build for web and api', async () => {
  const { REQUIRED_SCRIPTS } = await load();
  assert.deepEqual([...REQUIRED_SCRIPTS].sort(), [...EXPECTED_REQUIRED].sort());
  assert.ok(!REQUIRED_SCRIPTS.includes('install:renovate'));
  assert.ok(!REQUIRED_SCRIPTS.includes('check:renovate'));

  assert.deepEqual(await errorsFor(goodManifest()), []);
});

test('REQ-REPO-002 every required script is reported when missing', async () => {
  for (const name of EXPECTED_REQUIRED) {
    const m = goodManifest();
    delete m.scripts[name];
    const errs = await errorsFor(m);
    assert.equal(errs.length, 1, `${name}: expected exactly one error, got ${JSON.stringify(errs)}`);
    assert.ok(errs[0].includes(name), `error should name ${name}: ${errs[0]}`);
  }
});

test('REQ-REPO-002 root package.json missing typecheck:web is rejected', async () => {
  const m = goodManifest();
  delete m.scripts['typecheck:web'];
  const errs = await errorsFor(m);
  assert.ok(errs.length >= 1);
  assert.match(joined(errs), /typecheck:web/);
});

test('REQ-REPO-002 root package.json with no scripts object reports required scripts', async () => {
  const errs = await errorsFor({ name: 'x', private: true });
  assert.ok(errs.length >= EXPECTED_REQUIRED.length);
});

test('REQ-REPO-002 root package.json has no dependencies or workspaces', async () => {
  const withWorkspaces = await errorsFor(goodManifest({ workspaces: ['apps/*'] }));
  assert.ok(withWorkspaces.length >= 1);
  assert.match(joined(withWorkspaces), /workspaces/);

  const withDeps = await errorsFor(goodManifest({ dependencies: { left: '1.0.0' } }));
  assert.ok(withDeps.length >= 1);
  assert.match(joined(withDeps), /dependencies/);
});

test('REQ-REPO-002 root package.json rejects every dependency-bearing field', async () => {
  const fields = {
    dependencies: { a: '1.0.0' },
    devDependencies: { a: '1.0.0' },
    optionalDependencies: { a: '1.0.0' },
    peerDependencies: { a: '1.0.0' },
    bundleDependencies: ['a'],
    bundledDependencies: ['a'],
    workspaces: ['apps/*'],
  };
  for (const [field, value] of Object.entries(fields)) {
    const errs = await errorsFor(goodManifest({ [field]: value }));
    assert.ok(errs.some((e) => e.includes(field)), `${field} must be named in ${JSON.stringify(errs)}`);
  }
});

test('REQ-REPO-002 root package.json with an empty devDependencies object still fails (field present)', async () => {
  const errs = await errorsFor(goodManifest({ devDependencies: {} }));
  assert.match(joined(errs), /devDependencies/);
});

test('REQ-REPO-002 root package.json must be private true', async () => {
  for (const priv of [false, undefined, 'true']) {
    const m = goodManifest({ private: priv });
    if (priv === undefined) delete m.private;
    const errs = await errorsFor(m);
    assert.match(joined(errs), /private/, `private=${String(priv)}`);
  }
});

test('REQ-REPO-002 a root package-lock.json is an error', async () => {
  const errs = await errorsFor(goodManifest(), { lockfile: true });
  assert.match(joined(errs), /package-lock\.json/);
});

test('REQ-REPO-002 missing package.json is an error, not a throw', async () => {
  const errs = await errorsFor(null);
  assert.ok(errs.length >= 1);
  assert.match(joined(errs), /package\.json/);
});

test('REQ-REPO-002 invalid JSON in package.json is an error, not a throw', async () => {
  const errs = await errorsFor(null, { raw: '{ not json' });
  assert.ok(errs.length >= 1);
  assert.match(joined(errs), /package\.json/);
});

test('REQ-REPO-002 multiple problems are all reported', async () => {
  const m = goodManifest({ private: false, workspaces: ['a'] });
  delete m.scripts.verify;
  const errs = await errorsFor(m, { lockfile: true });
  const text = joined(errs);
  for (const needle of ['private', 'workspaces', 'package-lock.json', 'verify']) {
    assert.ok(text.includes(needle), `missing mention of ${needle} in ${text}`);
  }
});

test('REQ-REPO-002 app lockfiles under apps/ do not count as a root lockfile', async () => {
  const dir = await fixture(goodManifest());
  await mkdir(path.join(dir, 'apps', 'web'), { recursive: true });
  await writeFile(path.join(dir, 'apps', 'web', 'package-lock.json'), '{}');
  try {
    const { check } = await load();
    assert.deepEqual(await check(dir), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
