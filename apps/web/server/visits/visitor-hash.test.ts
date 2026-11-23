// Spec 003 V11-03 (REQ-COUNT-003): a visitor is identified only by a hash that changes every UTC day.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailySalt, utcDay, visitorHash } from './visitor-hash.ts';

const SECRET = 'test-secret-not-a-real-one';
const IP = '203.0.113.7';

test('REQ-COUNT-003 the same visitor on the same day gets the same hash', async () => {
  const a = await visitorHash(SECRET, '2026-11-25', IP);
  const b = await visitorHash(SECRET, '2026-11-25', IP);

  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('REQ-COUNT-003 the next day gives an unrelated hash, so days cannot be linked', async () => {
  const today = await visitorHash(SECRET, '2026-11-25', IP);
  const tomorrow = await visitorHash(SECRET, '2026-11-26', IP);

  assert.notEqual(today, tomorrow);
  assert.notEqual(await dailySalt(SECRET, '2026-11-25'), await dailySalt(SECRET, '2026-11-26'));
});

test('REQ-COUNT-003 a different IP is a different visitor', async () => {
  const base = await visitorHash(SECRET, '2026-11-25', IP);

  assert.notEqual(base, await visitorHash(SECRET, '2026-11-25', '203.0.113.8'));
});

test('REQ-COUNT-003 the hash contains not the IP, and needs the secret', async () => {
  const hash = await visitorHash(SECRET, '2026-11-25', IP);

  assert.ok(!hash.includes(IP) && !hash.includes('203') && !hash.includes('Mozilla'));
  assert.notEqual(hash, await visitorHash('another-secret', '2026-11-25', IP));
});

test('REQ-COUNT-002 utcDay uses the UTC calendar day', () => {
  assert.equal(utcDay(new Date('2026-11-25T23:59:59Z')), '2026-11-25');
  assert.equal(utcDay(new Date('2026-11-26T00:00:00Z')), '2026-11-26');
  assert.equal(utcDay(new Date('2026-11-26T03:00:00+05:30')), '2026-11-25');
});

// --- Spec 003 amendment 2026-11-23: hash of (salt, IP) only; IPv6 cut to /64 ---
const DAY = '2026-11-25';
type HashFn = (...args: string[]) => Promise<string>;
const h = visitorHash as unknown as HashFn;

test('REQ-COUNT-003 the user agent does not change the hash (rotating it cannot mint new visitors)', async () => {
  const a = await h(SECRET, DAY, IP, 'Mozilla/5.0 (a)');
  const b = await h(SECRET, DAY, IP, 'curl/8.0');

  assert.equal(a, b);
  assert.equal(a, await h(SECRET, DAY, IP));
});

test('REQ-COUNT-003 IPv6 addresses in the same /64 are one visitor, different /64 are different', async () => {
  const base = await h(SECRET, DAY, '2001:db8:1:2:aaaa::1');

  assert.equal(base, await h(SECRET, DAY, '2001:db8:1:2:bbbb:cccc:dddd:eeee'));
  assert.notEqual(base, await h(SECRET, DAY, '2001:db8:1:3:aaaa::1'));
  assert.notEqual(base, await h(SECRET, DAY, '2001:db8:2:2:aaaa::1'));
});

test('REQ-COUNT-003 compressed and expanded IPv6 forms of the same /64 hash the same', async () => {
  assert.equal(await h(SECRET, DAY, '2001:db8::1'), await h(SECRET, DAY, '2001:0DB8:0:0:0:0:0:2'));
});

test('REQ-COUNT-003 IPv4 addresses stay one visitor each', async () => {
  const a = await h(SECRET, DAY, '203.0.113.7');

  assert.equal(a, await h(SECRET, DAY, '203.0.113.7'));
  assert.notEqual(a, await h(SECRET, DAY, '203.0.113.8'));
  assert.notEqual(a, await h(SECRET, DAY, '203.0.114.7'));
});

test('REQ-COUNT-003 the salt still rotates per UTC day for IP-only hashes', async () => {
  assert.notEqual(await h(SECRET, '2026-11-25', IP), await h(SECRET, '2026-11-26', IP));
  assert.notEqual(
    await h(SECRET, '2026-11-25', '2001:db8:1:2::1'),
    await h(SECRET, '2026-11-26', '2001:db8:1:2::1'),
  );
});
