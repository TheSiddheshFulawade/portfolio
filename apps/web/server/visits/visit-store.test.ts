// Spec 003 V11-03 (REQ-COUNT-002, REQ-COUNT-004): one count per visitor per day, atomically.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { sqliteD1 } from './sqlite-d1.ts';
import { readTotals, recordVisit } from './visit-store.ts';

const MIGRATION = fileURLToPath(new URL('../../migrations/0001_visits.sql', import.meta.url));
const db = () => sqliteD1([MIGRATION]);

test('REQ-COUNT-002 a first visit counts once today and in the total', async () => {
  const d = db();

  const totals = await recordVisit(d, '2026-11-25', 'hash-a');

  assert.deepEqual(totals, { total: 1, today: 1 });
  d.close();
});

test('REQ-COUNT-002 a repeat visit on the same day is not counted again', async () => {
  const d = db();
  await recordVisit(d, '2026-11-25', 'hash-a');

  const totals = await recordVisit(d, '2026-11-25', 'hash-a');

  assert.deepEqual(totals, { total: 1, today: 1 });
  d.close();
});

test('REQ-COUNT-002 the next day starts today at zero and keeps the total', async () => {
  const d = db();
  await recordVisit(d, '2026-11-25', 'hash-a');
  await recordVisit(d, '2026-11-25', 'hash-b');

  const totals = await recordVisit(d, '2026-11-26', 'hash-c');

  assert.deepEqual(totals, { total: 3, today: 1 });
  assert.deepEqual(await readTotals(d, '2026-11-27'), { total: 3, today: 0 });
  d.close();
});

test('REQ-COUNT-004 concurrent visits: every distinct visitor counted, duplicates counted once', async () => {
  const d = db();
  const visits = Array.from({ length: 200 }, (_, i) => `hash-${i % 50}`);

  await Promise.all(visits.map((h) => recordVisit(d, '2026-11-25', h)));

  assert.deepEqual(await readTotals(d, '2026-11-25'), { total: 50, today: 50 });
  d.close();
});

test('REQ-COUNT-003 visitor hashes older than two days are deleted', async () => {
  const d = db();
  await recordVisit(d, '2026-11-20', 'old');
  await recordVisit(d, '2026-11-24', 'recent');

  await recordVisit(d, '2026-11-25', 'new');
  const kept = await d.prepare('SELECT COUNT(*) AS n FROM daily_visitors').first<{ n: number }>();

  assert.equal(kept?.n, 2);
  assert.deepEqual(await readTotals(d, '2026-11-25'), { total: 3, today: 1 });
  d.close();
});
