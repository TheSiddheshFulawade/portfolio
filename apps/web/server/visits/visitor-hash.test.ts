// Spec 003 V11-03 (REQ-COUNT-003): a visitor is identified only by a hash that changes every UTC day.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailySalt, utcDay, visitorHash } from './visitor-hash.ts';

const SECRET = 'test-secret-not-a-real-one';
const IP = '203.0.113.7';
const UA = 'Mozilla/5.0 (test)';

test('REQ-COUNT-003 the same visitor on the same day gets the same hash', async () => {
  const a = await visitorHash(SECRET, '2026-11-25', IP, UA);
  const b = await visitorHash(SECRET, '2026-11-25', IP, UA);

  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('REQ-COUNT-003 the next day gives an unrelated hash, so days cannot be linked', async () => {
  const today = await visitorHash(SECRET, '2026-11-25', IP, UA);
  const tomorrow = await visitorHash(SECRET, '2026-11-26', IP, UA);

  assert.notEqual(today, tomorrow);
  assert.notEqual(await dailySalt(SECRET, '2026-11-25'), await dailySalt(SECRET, '2026-11-26'));
});

test('REQ-COUNT-003 a different IP or user agent is a different visitor', async () => {
  const base = await visitorHash(SECRET, '2026-11-25', IP, UA);

  assert.notEqual(base, await visitorHash(SECRET, '2026-11-25', '203.0.113.8', UA));
  assert.notEqual(base, await visitorHash(SECRET, '2026-11-25', IP, 'Other/1.0'));
});

test('REQ-COUNT-003 the hash contains neither the IP nor the user agent, and needs the secret', async () => {
  const hash = await visitorHash(SECRET, '2026-11-25', IP, UA);

  assert.ok(!hash.includes(IP) && !hash.includes('203') && !hash.includes('Mozilla'));
  assert.notEqual(hash, await visitorHash('another-secret', '2026-11-25', IP, UA));
});

test('REQ-COUNT-002 utcDay uses the UTC calendar day', () => {
  assert.equal(utcDay(new Date('2026-11-25T23:59:59Z')), '2026-11-25');
  assert.equal(utcDay(new Date('2026-11-26T00:00:00Z')), '2026-11-26');
  assert.equal(utcDay(new Date('2026-11-26T03:00:00+05:30')), '2026-11-25');
});
