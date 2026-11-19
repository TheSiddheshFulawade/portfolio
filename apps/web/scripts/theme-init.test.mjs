// Spec 002 V1-03 (REQ-UI-002): public/theme-init.js applies a saved theme before first paint.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const SCRIPT = readFileSync(
  join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'public/theme-init.js'),
  'utf8',
);

function run(stored, { throws = false } = {}) {
  const dataset = {};
  const localStorage = {
    getItem: (k) => {
      if (throws) throw new Error('blocked');
      return k === 'sf-theme' ? stored : null;
    },
  };
  vm.runInNewContext(SCRIPT, { document: { documentElement: { dataset } }, localStorage });
  return dataset.theme;
}

test('REQ-UI-002 a saved dark or light choice is applied', () => {
  assert.equal(run('dark'), 'dark');
  assert.equal(run('light'), 'light');
});

test('REQ-UI-002 no saved choice leaves the system preference in charge', () => {
  assert.equal(run(null), undefined);
});

test('REQ-UI-002 unknown values and blocked storage are ignored', () => {
  assert.equal(run('purple'), undefined);
  assert.equal(run('dark', { throws: true }), undefined);
});
