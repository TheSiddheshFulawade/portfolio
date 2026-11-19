// Spec 003 V11-03 (REQ-COUNT-002, 005, 006): the /api/visits endpoint.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { handleVisits, type VisitsEnv } from './handler.ts';
import { sqliteD1 } from './sqlite-d1.ts';
import type { D1Database } from './visit-store.ts';

const MIGRATION = fileURLToPath(new URL('../../migrations/0001_visits.sql', import.meta.url));
const ORIGIN = 'https://siddheshfulawade.com';
const NOW = () => new Date('2026-11-25T10:00:00Z');

function env(db: D1Database = sqliteD1([MIGRATION])): VisitsEnv {
  return { VISITS_DB: db, VISIT_SALT: 'test-secret-not-a-real-one' };
}

function request(method: string, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/api/visits`, {
    method,
    headers: { 'cf-connecting-ip': '203.0.113.7', 'user-agent': 'Test/1.0', ...headers },
  });
}

test('REQ-COUNT-002 POST from the site records the visit and returns the totals', async () => {
  const e = env();

  const res = await handleVisits(request('POST', { origin: ORIGIN }), e, NOW);

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await res.json(), { total: 1, today: 1 });
});

test('REQ-COUNT-002 the same visitor posting twice is counted once; GET reads without counting', async () => {
  const e = env();
  await handleVisits(request('POST', { origin: ORIGIN }), e, NOW);
  await handleVisits(request('POST', { origin: ORIGIN }), e, NOW);

  const res = await handleVisits(request('GET'), e, NOW);

  assert.deepEqual(await res.json(), { total: 1, today: 1 });
});

test('REQ-COUNT-006 a POST from another origin, or with no origin, is refused with problem details', async () => {
  const cases: Record<string, string>[] = [{ origin: 'https://evil.example' }, {}];
  for (const headers of cases) {
    const res = await handleVisits(request('POST', headers), env(), NOW);

    assert.equal(res.status, 403);
    assert.equal(res.headers.get('content-type'), 'application/problem+json');
    const body = (await res.json()) as { status: number; title: string };
    assert.equal(body.status, 403);
  }
});

test('REQ-COUNT-006 other methods get 405 with an Allow header', async () => {
  const res = await handleVisits(request('DELETE', { origin: ORIGIN }), env(), NOW);

  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'GET, POST');
  assert.equal(res.headers.get('content-type'), 'application/problem+json');
});

test('REQ-COUNT-005 a database failure returns a generic 503 with no internals', async () => {
  const broken = {
    prepare: () => {
      throw new Error('D1_ERROR: secret internal detail');
    },
    batch: async () => {
      throw new Error('D1_ERROR: secret internal detail');
    },
  } as unknown as D1Database;

  const res = await handleVisits(request('POST', { origin: ORIGIN }), env(broken), NOW);
  const text = await res.text();

  assert.equal(res.status, 503);
  assert.ok(!text.includes('secret internal detail'));
});

test('REQ-COUNT-005 until the database and salt are configured, the endpoint answers 204 and stores nothing', async () => {
  const noSalt = { ...env(), VISIT_SALT: '' };
  const noDb = { VISIT_SALT: 'test-secret-not-a-real-one' } as unknown as VisitsEnv;

  for (const e of [noSalt, noDb]) {
    for (const method of ['GET', 'POST']) {
      const res = await handleVisits(request(method, { origin: ORIGIN }), e, NOW);

      assert.equal(res.status, 204, method);
      assert.equal(await res.text(), '');
    }
  }
});
