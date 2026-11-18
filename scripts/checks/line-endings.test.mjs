import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const load = () => import('./line-endings.mjs');

const GOOD_ATTRS = [
  '* text=auto eol=lf',
  '*.cmd text eol=crlf',
  '*.bat text eol=crlf',
  'mvnw text eol=lf',
  '*.sh text eol=lf',
  '*.pdf binary',
  '*.png binary',
  '*.jpg binary',
  '*.jpeg binary',
  '*.gif binary',
  '*.webp binary',
  '*.avif binary',
  '*.ico binary',
  '*.jar binary',
  '*.ttf binary',
  '*.woff binary',
  '*.woff2 binary',
].join('\n');

const line = (mode, eol, file) =>
  `${mode} d1a637aa1347529479f93987b8d336cbb8514432 0\ti/${eol}    w/${eol}    attr/text=auto eol=lf \t${file}`;

test('REQ-REPO-004 .gitattributes forces LF and CRLF only for cmd/bat', async () => {
  const { attributesErrors } = await load();
  assert.deepEqual(attributesErrors(GOOD_ATTRS), []);

  const noDefault = attributesErrors(GOOD_ATTRS.replace('* text=auto eol=lf', ''));
  assert.ok(noDefault.some((e) => e.includes('* text=auto eol=lf')), JSON.stringify(noDefault));

  const crlfElsewhere = attributesErrors(`${GOOD_ATTRS}\n*.md text eol=crlf`);
  assert.ok(crlfElsewhere.some((e) => e.includes('*.md')), JSON.stringify(crlfElsewhere));

  const noMvnw = attributesErrors(GOOD_ATTRS.replace('mvnw text eol=lf', ''));
  assert.ok(noMvnw.some((e) => e.includes('mvnw')), JSON.stringify(noMvnw));

  const noCmd = attributesErrors(GOOD_ATTRS.replace('*.cmd text eol=crlf', ''));
  assert.ok(noCmd.some((e) => e.includes('*.cmd')), JSON.stringify(noCmd));

  const noBinary = attributesErrors(GOOD_ATTRS.replace('*.woff binary', ''));
  assert.ok(noBinary.some((e) => e.includes('*.woff')), JSON.stringify(noBinary));

  // Comments and blank lines are ignored.
  assert.deepEqual(attributesErrors(`# line endings\n\n${GOOD_ATTRS}\n`), []);
});

test('REQ-REPO-004 no tracked text file has CRLF in the index (git ls-files --eol)', async () => {
  const { parseLsFiles, indexErrors } = await load();
  const good = parseLsFiles(
    [line('100644', 'lf', 'README.md'), line('100644', 'crlf', 'apps/api/mvnw.cmd'), line('100644', '-text', 'logo.png'), line('100644', 'none', 'apps/.gitkeep')].join('\n'),
  );
  assert.equal(good.length, 4);
  assert.deepEqual(good[0], { mode: '100644', index: 'lf', path: 'README.md' });
  assert.deepEqual(indexErrors(good), []);

  const bad = parseLsFiles([line('100644', 'crlf', 'src/app.ts'), line('100644', 'mixed', 'docs/x.md')].join('\n'));
  const errs = indexErrors(bad);
  assert.equal(errs.length, 2, JSON.stringify(errs));
  assert.ok(errs[0].includes('src/app.ts'));
  assert.ok(errs[1].includes('docs/x.md'));

  // A .bat file is allowed CRLF too; paths with spaces survive parsing.
  assert.deepEqual(indexErrors(parseLsFiles(line('100644', 'crlf', 'tools/run me.bat'))), []);
  assert.deepEqual(parseLsFiles(line('100644', 'lf', 'docs/a b.md'))[0].path, 'docs/a b.md');
});

test('REQ-REPO-004 mvnw is tracked as 100755', async () => {
  const { parseLsFiles, indexErrors } = await load();
  // Vacuously true when no wrapper is tracked yet.
  assert.deepEqual(indexErrors(parseLsFiles(line('100644', 'lf', 'README.md'))), []);
  assert.deepEqual(indexErrors(parseLsFiles([line('100755', 'lf', 'apps/api/mvnw'), line('100755', 'lf', 'scripts/x.sh')].join('\n'))), []);

  const errs = indexErrors(parseLsFiles([line('100644', 'lf', 'apps/api/mvnw'), line('100644', 'lf', 'scripts/x.sh')].join('\n')));
  assert.equal(errs.length, 2, JSON.stringify(errs));
  assert.ok(errs.some((e) => e.includes('apps/api/mvnw') && e.includes('100755')));
  assert.ok(errs.some((e) => e.includes('scripts/x.sh')));
});

test('REQ-REPO-004 check(root) reports a bad .gitattributes and passes on the real repo', async () => {
  const { check } = await load();
  const dir = mkdtempSync(path.join(tmpdir(), 'line-endings-'));
  try {
    writeFileSync(path.join(dir, '.gitattributes'), '* text=auto\n');
    const errs = check(dir);
    assert.ok(errs.length > 0, 'a bare text=auto must fail');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const { fileURLToPath } = await import('node:url');
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  assert.deepEqual(check(repoRoot), []);
});
