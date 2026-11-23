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

// --- Spec 003 amendment 2026-11-23 (REQ-COUNT-007) ---
import { VISIT_HOSTS } from './handler.ts';

function postTo(host: string, ip = '203.0.113.7', ua = 'Test/1.0') {
  const origin = `https://${host}`;
  return new Request(`${origin}/api/visits`, {
    method: 'POST',
    headers: { origin, 'cf-connecting-ip': ip, 'user-agent': ua },
  });
}

test('REQ-COUNT-007 VISIT_HOSTS lists exactly the configured site hosts', () => {
  assert.deepEqual([...VISIT_HOSTS].sort(), [
    'portfolio-7qt.pages.dev',
    'siddheshfulawade.com',
    'www.siddheshfulawade.com',
  ]);
});

test('REQ-COUNT-007 configured hosts record the visit', async () => {
  for (const host of [
    'siddheshfulawade.com',
    'www.siddheshfulawade.com',
    'portfolio-7qt.pages.dev',
  ]) {
    const res = await handleVisits(postTo(host), env(), NOW);

    assert.equal(res.status, 200, host);
    assert.deepEqual(await res.json(), { total: 1, today: 1 }, host);
  }
});

test('REQ-COUNT-007 preview and look-alike hosts get the totals and nothing is written', async () => {
  const e = env();
  await handleVisits(postTo('siddheshfulawade.com', '198.51.100.1'), e, NOW);
  for (const host of [
    'abc123.portfolio-7qt.pages.dev',
    'develop.portfolio-7qt.pages.dev',
    'evil-siddheshfulawade.com',
    'siddheshfulawade.com.evil.example',
  ]) {
    const res = await handleVisits(postTo(host), e, NOW);

    assert.equal(res.status, 200, host);
    assert.deepEqual(await res.json(), { total: 1, today: 1 }, host);
  }
  const rows = await e.VISITS_DB.prepare('SELECT COUNT(*) AS n FROM daily_visitors').first<{
    n: number;
  }>();
  assert.equal(rows?.n, 1);
});

test('REQ-COUNT-003 rotating the user agent from one IP is still one visitor', async () => {
  const e = env();
  for (let i = 0; i < 5; i++) {
    await handleVisits(postTo('siddheshfulawade.com', '203.0.113.7', `UA/${i}`), e, NOW);
  }

  const res = await handleVisits(request('GET'), e, NOW);

  assert.deepEqual(await res.json(), { total: 1, today: 1 });
});

test('REQ-COUNT-007 an already-counted visitor causes no write (no batch, no run)', async () => {
  const inner = sqliteD1([MIGRATION]);
  let batches = 0;
  let runs = 0;
  const wrap = (st: ReturnType<D1Database['prepare']>): ReturnType<D1Database['prepare']> =>
    Object.assign(Object.create(st), {
      bind: (...v: (string | number | null)[]) => wrap(st.bind(...v)),
      first: <T>() => st.first<T>(),
      run: () => {
        runs++;
        return st.run();
      },
    });
  const spy: D1Database = {
    prepare: (sql) => wrap(inner.prepare(sql)),
    batch: (s) => {
      batches++;
      return inner.batch(s);
    },
  };
  const e = env(spy);
  await handleVisits(postTo('siddheshfulawade.com'), e, NOW);
  batches = 0;
  runs = 0;

  const res = await handleVisits(postTo('siddheshfulawade.com'), e, NOW);

  assert.deepEqual(await res.json(), { total: 1, today: 1 });
  assert.equal(batches, 0);
  assert.equal(runs, 0);
});

test('REQ-COUNT-007 every response carries nosniff and CORP same-site (json, problem, 405, 204)', async () => {
  const broken = {
    prepare: () => {
      throw new Error('x');
    },
    batch: async () => {
      throw new Error('x');
    },
  } as unknown as D1Database;
  const responses: Record<string, Response> = {
    'POST 200': await handleVisits(postTo('siddheshfulawade.com'), env(), NOW),
    'GET 200': await handleVisits(request('GET'), env(), NOW),
    'preview 200': await handleVisits(postTo('abc123.portfolio-7qt.pages.dev'), env(), NOW),
    '403': await handleVisits(request('POST', { origin: 'https://evil.example' }), env(), NOW),
    '405': await handleVisits(request('DELETE'), env(), NOW),
    '503': await handleVisits(postTo('siddheshfulawade.com'), env(broken), NOW),
    '204 dormant': await handleVisits(request('GET'), { ...env(), VISIT_SALT: '' }, NOW),
  };
  for (const [name, res] of Object.entries(responses)) {
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', name);
    assert.equal(res.headers.get('cross-origin-resource-policy'), 'same-site', name);
  }
});
