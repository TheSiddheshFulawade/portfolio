// REQ-PERF-001: the theme script and global stylesheet are inline, so first paint needs no extra request, and
// the CSP hashes cover them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inlinePage, main } from './inline-critical.mjs';
import { inlineHashes } from './emit-headers.mjs';

const files = { 'theme-init.js': '(function(){})();\n', 'styles-AB12.css': ':root{--bg:#000}\n' };
const read = (name) => files[name];
const page =
  '<head><script src="theme-init.js"></script><link rel="icon" href="favicon.ico">' +
  '<link rel="stylesheet" href="styles-AB12.css"><style ng-app-id="ng">a{}</style></head>';

test('REQ-PERF-001 the theme script and the global stylesheet are copied into the page in place', () => {
  const out = inlinePage(page, read);
  assert.equal(
    out,
    '<head><script>(function(){})();</script><link rel="icon" href="favicon.ico">' +
      '<style>:root{--bg:#000}</style><style ng-app-id="ng">a{}</style></head>',
  );
});

test('REQ-PERF-001 the inlined script and style get CSP hashes', () => {
  const { scripts, styles } = inlineHashes(inlinePage(page, read));
  assert.equal(scripts.length, 1);
  assert.equal(styles.length, 2);
});

test('REQ-PERF-001 a page that is already inline is left as it is', () => {
  const once = inlinePage(page, read);
  assert.equal(inlinePage(once, read), once);
});

test('REQ-PERF-001 font urls in the inlined stylesheet are root-relative, not tied to <base href>', () => {
  const css = {
    ...files,
    'styles-AB12.css': '@font-face{src:url("./media/a.woff2")}b{src:url(./media/b.woff2)}',
  };
  const out = inlinePage(page, (n) => css[n]);
  assert.match(out, /url\("\/media\/a\.woff2"\)/);
  assert.match(out, /url\(\/media\/b\.woff2\)/);
});

function dist(pages) {
  const root = mkdtempSync(join(tmpdir(), 'inline-'));
  const browser = join(root, 'browser');
  mkdirSync(browser);
  for (const [n, c] of Object.entries({ ...files, ...pages })) writeFileSync(join(browser, n), c);
  return root;
}
const quiet = () => undefined;

test('REQ-PERF-001 the build fails when no page was inlined', () => {
  const errors = [];
  const code = main([dist({ 'index.html': '<head></head>' })], {
    log: quiet,
    error: (m) => errors.push(m),
  });
  assert.equal(code, 1);
  assert.match(errors[0], /no page was inlined/);
});

test('REQ-PERF-001 the build fails when a page still references the theme script or stylesheet', () => {
  const errors = [];
  const root = dist({
    'index.html': page,
    'about.html': '<head><script src="theme-init.js" defer></script></head>',
  });
  const code = main([root], { log: quiet, error: (m) => errors.push(m) });
  assert.equal(code, 1);
  assert.match(errors[0], /still references/);
});

test('REQ-PERF-001 the build passes when every page is inlined', () => {
  const root = dist({ 'index.html': page });
  assert.equal(main([root], { log: quiet, error: quiet }), 0);
  assert.doesNotMatch(readFileSync(join(root, 'browser', 'index.html'), 'utf8'), /theme-init\.js/);
});
