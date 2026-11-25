// Spec 005 RD-04: footer, contact and 404 copy live in content/site.yaml and are validated by site.schema.json.
// Each test copies the real content/ to a temp dir and changes one thing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContent } from './build-content.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REAL = resolve(HERE, '../../../content');

function withContent(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'content-'));
  cpSync(REAL, dir, { recursive: true });
  mutate?.(dir);
  return { dir, done: () => rmSync(dir, { recursive: true, force: true }) };
}
const edit = (dir, file, fn) =>
  writeFileSync(
    join(dir, file),
    fn(readFileSync(join(dir, file), 'utf8').replaceAll('\r\n', '\n')),
  );
const SITE = 'site.yaml';

test('REQ-UI-102 the real footer content carries identity, copyright year, headings, note and source link', async () => {
  const { content, errors } = await buildContent({ contentDir: REAL });

  assert.deepEqual(errors, []);
  const f = content.site.footer;
  assert.ok(f.identity.length > 10, 'identity line');
  assert.ok(Number.isInteger(f.copyrightYear) && f.copyrightYear >= 2026, 'copyright year');
  for (const key of [
    'navLabel',
    'siteHeading',
    'systemsHeading',
    'profilesHeading',
    'note',
    'sourceLabel',
  ]) {
    assert.ok(typeof f[key] === 'string' && f[key].length > 0, `footer.${key}`);
  }
  assert.match(f.sourceUrl, /^https:\/\/github\.com\//);
});

for (const key of ['identity', 'copyrightYear', 'systemsHeading']) {
  test(`REQ-UI-102 a footer without ${key} fails with the file and the field`, async () => {
    const c = withContent((d) =>
      edit(d, SITE, (s) => s.replace(new RegExp(`^  ${key}: .*\n`, 'm'), '')),
    );

    const { errors } = await buildContent({ contentDir: c.dir });
    c.done();

    assert.match(
      errors.join('\n'),
      new RegExp(`site\.yaml: /footer must have required property '${key}'`),
    );
  });
}

test('REQ-UI-102 a copyright year that is not a whole number fails', async () => {
  const c = withContent((d) =>
    edit(d, SITE, (s) => s.replace(/copyrightYear: \d+/, 'copyrightYear: "twenty-six"')),
  );

  const { errors } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.match(errors.join('\n'), /site\.yaml: \/footer\/copyrightYear /);
});

test('REQ-UI-102 an unknown footer key fails (no stray copy outside the schema)', async () => {
  const c = withContent((d) =>
    edit(d, SITE, (s) => s.replace('footer:\n', 'footer:\n  tagline: x\n')),
  );

  const { errors } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.match(errors.join('\n'), /site\.yaml: \/footer must NOT have additional properties/);
});

test('REQ-UI-101 the closing contact section has a heading and a line of copy', async () => {
  const { content } = await buildContent({ contentDir: REAL });

  assert.ok(content.site.contact.heading.length > 5);
  assert.ok(content.site.contact.body.length > 20);
});

test('REQ-UI-101 a missing contact section fails with the file and the field', async () => {
  const c = withContent((d) => edit(d, SITE, (s) => s.replace(/^contact:\n(  .*\n)+/m, '')));

  const { errors } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.match(errors.join('\n'), /site\.yaml: .*must have required property 'contact'/);
});

test('REQ-UI-104 the 404 copy is a plain message with a way home and no financial claim', async () => {
  const { content } = await buildContent({ contentDir: REAL });
  const nf = content.site.pages.notFound;

  assert.ok(nf.heading && nf.body && nf.action, 'heading, body and action are all set');
  assert.doesNotMatch(
    [nf.heading, nf.body, nf.action].join(' '),
    /payment|money|ledger|balance|settle|transfer|\$|£|€|₹|%|\d/i,
  );
});

test('REQ-MOT-101 no stylesheet under src/ declares an infinite animation', () => {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(scss|css)$/.test(name)) files.push(p);
    }
  };
  walk(resolve(HERE, '../src'));

  const offenders = files.filter((f) => /\binfinite\b/.test(readFileSync(f, 'utf8')));

  assert.ok(files.length > 5);
  assert.deepEqual(offenders, []);
});
