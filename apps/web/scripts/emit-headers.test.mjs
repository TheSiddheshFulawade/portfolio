// Spec 003 V11-02: security headers and a hash-based CSP for Cloudflare Pages (REQ-SEC-001).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildHeaders, inlineHashes, main, parseHeaders } from './emit-headers.mjs';

const sha = (text) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

const page = (body) =>
  `<!doctype html><html><head><style>a{color:red}</style>` +
  `<script src="theme-init.js"></script><script type="application/json" id="ng-state">{}</script>` +
  `</head><body>${body}<script>window.boot(1);</script></body></html>`;

test('REQ-SEC-001 hashes inline scripts and styles, and skips external and JSON scripts', () => {
  const { scripts, styles } = inlineHashes(page(''));

  assert.deepEqual(scripts, [sha('window.boot(1);')]);
  assert.deepEqual(styles, [sha('a{color:red}')]);
});

test('REQ-SEC-001 the header set is complete and the CSP never allows unsafe-inline or unsafe-eval', () => {
  const headers = buildHeaders({ scripts: [sha('x')], styles: [sha('y')] });
  const csp = headers['Content-Security-Policy'];

  assert.match(csp, /default-src 'self'/);
  assert.match(csp, new RegExp(`script-src 'self' ${sha('x').replace(/[+/=]/g, '\\$&')}`));
  assert.match(csp, new RegExp(`style-src 'self' ${sha('y').replace(/[+/=]/g, '\\$&')}`));
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  assert.equal(
    headers['Strict-Transport-Security'],
    'max-age=63072000; includeSubDomains; preload',
  );
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.equal(headers['Cross-Origin-Opener-Policy'], 'same-origin');
  for (const feature of ['camera', 'microphone', 'geolocation', 'payment']) {
    assert.match(headers['Permissions-Policy'], new RegExp(`\\b${feature}=\\(\\)`), feature);
  }
});

test('REQ-SEC-001 main writes _headers covering every inline block on every page, once each', () => {
  const dir = mkdtempSync(join(tmpdir(), 'headers-'));
  const browser = join(dir, 'browser');
  mkdirSync(join(browser, 'about'), { recursive: true });
  writeFileSync(join(browser, 'index.html'), page(''));
  writeFileSync(
    join(browser, 'about', 'index.html'),
    page('<script>window.other();</script><style>b{}</style>'),
  );

  const code = main([dir], { log: () => {} });
  const parsed = parseHeaders(readFileSync(join(browser, '_headers'), 'utf8'));
  rmSync(dir, { recursive: true, force: true });

  assert.equal(code, 0);
  const csp = parsed['/*']['Content-Security-Policy'];
  for (const hash of [
    sha('window.boot(1);'),
    sha('window.other();'),
    sha('a{color:red}'),
    sha('b{}'),
  ]) {
    assert.equal(csp.split(hash).length, 2, `${hash} appears exactly once`);
  }
});

test('REQ-SEC-001 main fails without a build', () => {
  const dir = mkdtempSync(join(tmpdir(), 'headers-'));

  const code = main([dir], { log: () => {}, error: () => {} });
  rmSync(dir, { recursive: true, force: true });

  assert.equal(code, 1);
});

test('REQ-SEC-001 main fails when a header line would pass the 2,000-character Cloudflare Pages limit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'headers-'));
  const browser = join(dir, 'browser');
  mkdirSync(browser, { recursive: true });
  const styles = Array.from({ length: 60 }, (_, i) => `<style>.c${i}{}</style>`).join('');
  writeFileSync(join(browser, 'index.html'), page(styles));
  const errors = [];

  const code = main([dir], { log: () => {}, error: (e) => errors.push(e) });
  rmSync(dir, { recursive: true, force: true });

  assert.equal(code, 1);
  assert.match(errors.join('\n'), /Content-Security-Policy.*2,000/);
});
