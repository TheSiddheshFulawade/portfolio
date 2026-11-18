import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const load = () => import('./toolchain.mjs');

test('REQ-REPO-003 .nvmrc is an exact 24.x version >= 24.15.0', async () => {
  const { nvmrcErrors } = await load();
  for (const ok of ['24.15.0', '24.22.3', '24.22.3\n', '24.100.0']) {
    assert.deepEqual(nvmrcErrors(ok), [], `${JSON.stringify(ok)} must pass`);
  }
  for (const bad of ['24', 'lts/*', 'v24', 'v24.22.3', '26.0.0', '24.14.9', '22.22.3', '24.22', '24.x', '', '24.22.3 # comment', '>=24.15.0']) {
    assert.ok(nvmrcErrors(bad).length > 0, `${JSON.stringify(bad)} must be rejected`);
  }
});

test('REQ-REPO-003 check(root) requires .nvmrc', async () => {
  const { check } = await load();
  const dir = mkdtempSync(path.join(tmpdir(), 'toolchain-'));
  try {
    assert.ok(check(dir).some((e) => e.includes('.nvmrc')), 'missing .nvmrc must fail');
    writeFileSync(path.join(dir, '.nvmrc'), '24.22.3\n');
    assert.deepEqual(check(dir), []);
    writeFileSync(path.join(dir, '.nvmrc'), 'lts/*\n');
    assert.ok(check(dir).length > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
