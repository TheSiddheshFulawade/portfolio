// REQ-PERF-101: the bundle check finds page-only data in the main bundle and ignores a clean one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leaks } from './verify-bundle.mjs';

const generated = {
  home: {
    decisions: [{ reason: 'A fixed lock order makes a lock cycle impossible by construction.' }],
  },
  results: { lab: { workload: '100,000 transfers per row with two percent duplicates injected.' } },
  bodies: { lab: '<p>The ledger moves money between accounts without losing a single cent.</p>' },
};

test('REQ-PERF-101 a clean main bundle reports no leak', () => {
  assert.deepEqual(leaks('console.log("shell only")', generated), []);
});

test('REQ-PERF-101 page-only data in the main bundle is named', () => {
  const main =
    'x="A fixed lock order makes a lock cycle impossible by construction.";y="The ledger moves money between accounts without losing a single cent."';
  assert.deepEqual(leaks(main, generated), ['decisions', 'project bodies']);
});
