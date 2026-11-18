import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const load = () => import('./web-config.mjs');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const goodPackage = () => ({
  name: 'web',
  private: true,
  engines: { node: '>=24.15.0 <25.0.0' },
  dependencies: { '@angular/core': '22.2.7', rxjs: '7.8.2', tslib: '2.8.1' },
  devDependencies: { typescript: '6.0.3' },
});
const goodAngular = () => ({
  projects: {
    web: {
      architect: {
        build: {
          builder: '@angular/build:application',
          options: { browser: 'src/main.ts', server: 'src/main.server.ts', outputMode: 'static' },
        },
      },
    },
  },
});
const goodServerRoutes = `import { RenderMode, ServerRoute } from '@angular/ssr';
export const serverRoutes: ServerRoute[] = [{ path: '**', renderMode: RenderMode.Prerender }];
`;

/** Builds a fixture repo. `mutate` receives the mutable parts before they are written. */
function fixture(mutate = () => {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'web-config-'));
  const parts = {
    pkg: goodPackage(),
    angular: goodAngular(),
    serverRoutes: goodServerRoutes,
    lock: '{}',
    nvmrc: '24.22.3\n',
    rootPkg: { name: 'portfolio', private: true, scripts: {} },
    extraFiles: {},
  };
  mutate(parts);
  mkdirSync(path.join(dir, 'apps/web/src/app'), { recursive: true });
  const w = (rel, text) => text !== null && writeFileSync(path.join(dir, rel), text);
  w('.nvmrc', parts.nvmrc);
  w('package.json', JSON.stringify(parts.rootPkg));
  w('apps/web/package.json', JSON.stringify(parts.pkg));
  w('apps/web/angular.json', JSON.stringify(parts.angular));
  w('apps/web/src/app/app.routes.server.ts', parts.serverRoutes);
  w('apps/web/package-lock.json', parts.lock);
  for (const [rel, text] of Object.entries(parts.extraFiles)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    w(rel, text);
  }
  return dir;
}
async function errorsFor(mutate) {
  const { check } = await load();
  const dir = fixture(mutate);
  try {
    return check(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const has = (errors, text) => errors.some((e) => e.includes(text));

test('REQ-WEB-001 zone.js absent, outputMode static, server routes prerender', async () => {
  assert.deepEqual(await errorsFor(() => {}), []);
  assert.ok(has(await errorsFor((p) => (p.pkg.dependencies['zone.js'] = '0.15.0')), 'zone.js'));
  assert.ok(has(await errorsFor((p) => (p.pkg.devDependencies.express = '5.1.0')), 'express'));
  assert.ok(
    has(await errorsFor((p) => (p.angular.projects.web.architect.build.options.outputMode = 'server')), 'outputMode'),
  );
  assert.ok(
    has(await errorsFor((p) => (p.angular.projects.web.architect.build.options.ssr = { entry: 'src/server.ts' })), 'ssr.entry'),
  );
  assert.ok(
    has(await errorsFor((p) => (p.angular.projects.web.architect.build.options.polyfills = ['zone.js'])), 'polyfills'),
  );
  assert.ok(has(await errorsFor((p) => (p.serverRoutes = 'export const serverRoutes = [];')), 'Prerender'));
  assert.ok(
    has(await errorsFor((p) => (p.serverRoutes = p.serverRoutes.replace('Prerender', 'Server'))), 'Prerender'),
  );
  assert.ok(has(await errorsFor((p) => (p.extraFiles['apps/web/src/server.ts'] = '')), 'server.ts'));
});

test('REQ-WEB-006 no ^ or ~ in dependencies, devDependencies, optionalDependencies, overrides', async () => {
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const range of ['^1.2.3', '~1.2.3', '>=1.0.0', '*', 'latest', '1.x']) {
      const errors = await errorsFor((p) => (p.pkg[section] = { ...p.pkg[section], foo: range }));
      assert.ok(has(errors, `${section}.foo`), `${section} ${range} must be rejected`);
    }
  }
  assert.ok(has(await errorsFor((p) => (p.pkg.overrides = { foo: '^1.0.0' })), 'overrides.foo'));
  assert.ok(has(await errorsFor((p) => (p.pkg.overrides = { foo: { bar: '~1.0.0' } })), 'overrides.foo.bar'));
  assert.deepEqual(await errorsFor((p) => (p.pkg.overrides = { foo: { bar: '1.0.0' }, baz: '$foo' })), []);
});

test('REQ-WEB-006 package-lock.json is committed', async () => {
  assert.ok(has(await errorsFor((p) => (p.lock = null)), 'package-lock.json'));
});

test('REQ-REPO-001 web is an independent project (own package.json and lockfile)', async () => {
  assert.ok(has(await errorsFor((p) => (p.rootPkg.workspaces = ['apps/*'])), 'workspaces'));
  const { check } = await load();
  const dir = mkdtempSync(path.join(tmpdir(), 'web-config-empty-'));
  try {
    assert.ok(check(dir).some((e) => e.includes('apps/web/package.json')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('REQ-REPO-003 .nvmrc satisfies apps/web engines.node', async () => {
  assert.ok(has(await errorsFor((p) => (p.nvmrc = '24.14.0\n')), 'engines.node'));
  assert.ok(has(await errorsFor((p) => (p.nvmrc = '25.0.0\n')), 'engines.node'));
  assert.ok(has(await errorsFor((p) => delete p.pkg.engines), 'engines.node'));
  assert.deepEqual(await errorsFor((p) => (p.nvmrc = '24.15.0\n')), []);
});

test('REQ-REPO-001 the real repository passes the web-config checks', async () => {
  const { check } = await load();
  assert.deepEqual(check(repoRoot), []);
});
