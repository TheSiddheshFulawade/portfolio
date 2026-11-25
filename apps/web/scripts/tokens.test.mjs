// Spec 002 V1-03: design tokens meet WCAG contrast in both themes; components use tokens, not literal colours.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOKENS = readFileSync(join(WEB, 'src/styles/tokens.css'), 'utf8');

/** Colour declarations of the first rule whose selector contains `marker`. */
function theme(marker) {
  for (const m of TOKENS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1].includes(marker)) continue;
    return Object.fromEntries(
      [...m[2].matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((d) => [d[1], d[2]]),
    );
  }
  throw new Error(`no rule with ${marker} in tokens.css`);
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const PAIRS = [
  // [foreground, background, minimum]
  ['--text', '--bg', 4.5],
  ['--text', '--panel', 4.5],
  ['--text-strong', '--bg', 4.5],
  ['--dim', '--bg', 4.5],
  ['--dim', '--panel', 4.5],
  ['--accent', '--bg', 4.5],
  ['--accent', '--panel', 4.5],
  ['--amber', '--panel', 4.5],
  ['--red', '--panel', 4.5],
  ['--line', '--bg', 1.2],
  // Spec 005 RD-02: second line colour, ink on solid buttons, text on the nested surface.
  ['--line-2', '--bg', 1.5],
  ['--control', '--bg', 3],
  ['--control', '--panel', 3],
  ['--accent-ink', '--accent', 4.5],
  ['--text', '--raise', 4.5],
  ['--text-strong', '--raise', 4.5],
  ['--dim', '--raise', 4.5],
  ['--accent', '--raise', 4.5],
  ['--amber', '--raise', 4.5],
  ['--red', '--raise', 4.5],
  ['--amber', '--bg', 4.5],
  ['--red', '--bg', 4.5],
];

for (const name of ['dark', 'light']) {
  test(`REQ-UI-005 ${name} theme tokens meet contrast minimums`, () => {
    const t = theme(`[data-theme='${name}']`);
    for (const [fg, bg, min] of PAIRS) {
      assert.ok(t[fg] && t[bg], `${name}: ${fg} or ${bg} missing`);
      const ratio = contrast(t[fg], t[bg]);
      assert.ok(ratio >= min, `${name}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs ${min}:1`);
    }
  });
}

test('REQ-UI-002 the system light preference and the explicit light theme use the same colours', () => {
  assert.deepEqual(theme(":root:not([data-theme='dark'])"), theme("[data-theme='light']"));
});

test('REQ-UI-004 reduced motion turns off animation and transitions', () => {
  const base = readFileSync(join(WEB, 'src/styles/base.css'), 'utf8');
  assert.match(
    base,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration:\s*0\.01ms !important[\s\S]*transition-duration:\s*0\.01ms !important/,
  );
});

test('REQ-UI-005 component styles use tokens, not literal colours', () => {
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(s?css|html|ts)$/.test(e.name) && !e.name.endsWith('.spec.ts')) files.push(p);
    }
  };
  walk(join(WEB, 'src/app'));
  const literal = /#[0-9a-fA-F]{3,8}\b(?![\w-])|\brgba?\(|\bhsla?\(/;
  const offenders = files.filter((f) => {
    const text = readFileSync(f, 'utf8');
    return f.endsWith('.ts')
      ? /styles?:\s*[`'[]/.test(text) && literal.test(text)
      : literal.test(text);
  });
  assert.deepEqual(offenders, []);
});

test('REQ-MOT-102 reduced motion stops view transitions; smooth scrolling needs no-preference', () => {
  const base = readFileSync(join(WEB, 'src/styles/base.css'), 'utf8');
  assert.match(
    base,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*::view-transition-group\(\*\)[\s\S]*animation:\s*none !important/,
  );
  const smooth = base.indexOf('scroll-behavior: smooth');
  if (smooth === -1) return;
  const media = base.lastIndexOf('@media (prefers-reduced-motion: no-preference)', smooth);
  assert.ok(media !== -1, 'scroll-behavior: smooth must sit inside no-preference');
  assert.doesNotMatch(
    base.slice(media, smooth),
    /\n\}/,
    'smooth scrolling is outside no-preference',
  );
});

test('REQ-MOT-101 no animation in the global styles loops forever', () => {
  for (const file of ['tokens.css', 'base.css'])
    assert.doesNotMatch(readFileSync(join(WEB, 'src/styles', file), 'utf8'), /\binfinite\b/);
});
