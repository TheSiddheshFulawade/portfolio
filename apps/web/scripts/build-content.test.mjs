// Spec 002 V1-02: content build. Each test copies the real content/ to a temp dir and changes one thing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContent, robotsTxt, sitemapXml } from './build-content.mjs';

const REAL = resolve(dirname(fileURLToPath(import.meta.url)), '../../../content');

function withContent(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'content-'));
  cpSync(REAL, dir, { recursive: true });
  mutate?.(dir);
  return { dir, done: () => rmSync(dir, { recursive: true, force: true }) };
}
const edit = (dir, file, fn) =>
  writeFileSync(join(dir, file), fn(readFileSync(join(dir, file), 'utf8')));
const joined = (errors) => errors.join('\n');

test('REQ-CONTENT-002 the real content builds without errors', async () => {
  const { content, errors } = await buildContent({ contentDir: REAL });

  assert.deepEqual(errors, []);
  assert.equal(content.profile.name, 'Siddhesh Fulawade');
  assert.ok(content.experience.length >= 1);
  assert.ok(content.projects.some((p) => p.id === 'settlement-lab'));
});

test('REQ-CONTENT-002 an invalid field fails with the file and the field', async () => {
  const c = withContent((d) =>
    edit(d, 'experience/2024-07-lumu.yaml', (s) => s.replace('mode: Remote', 'mode: Sometimes')),
  );

  const { errors } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.match(joined(errors), /experience\/2024-07-lumu\.yaml: \/mode /);
});

test('REQ-CONTENT-002 a missing required field fails with the file', async () => {
  const c = withContent((d) => edit(d, 'metrics.yaml', (s) => s.replace(/^    source: .*\n/m, '')));

  const { errors } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.match(joined(errors), /metrics\.yaml: \/items\/0 must have required property 'source'/);
});

test('REQ-CONTENT-002 a file name that differs from its id fails', async () => {
  const c = withContent((d) =>
    edit(d, 'projects/pennywise.md', (s) => s.replace('id: pennywise', 'id: penny')),
  );

  const { errors } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.match(joined(errors), /projects\/pennywise\.md: id "penny" must match the file name/);
});

test('REQ-CONTENT-003 unpublished projects and roles are dropped', async () => {
  const c = withContent((d) => {
    edit(d, 'projects/pennywise.md', (s) => s.replace('published: true', 'published: false'));
    edit(d, 'experience/2024-07-lumu.yaml', (s) =>
      s.replace('published: true', 'published: false'),
    );
  });

  const { content, errors } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.deepEqual(errors, []);
  assert.ok(!content.projects.some((p) => p.id === 'pennywise'));
  assert.ok(!content.experience.some((e) => e.id === '2024-07-lumu'));
});

test('REQ-CONTENT-003 skill evidence pointing at an unpublished item is dropped, unknown ids fail', async () => {
  const hidden = withContent((d) =>
    edit(d, 'projects/pennywise.md', (s) => s.replace('published: true', 'published: false')),
  );
  const { content } = await buildContent({ contentDir: hidden.dir });
  hidden.done();
  const evidence = content.skills.flatMap((g) => g.skills.flatMap((s) => s.evidence));
  assert.ok(!evidence.includes('pennywise'));

  const unknown = withContent((d) =>
    edit(d, 'skills.yaml', (s) => s.replace('evidence: [pennywise]', 'evidence: [no-such-thing]')),
  );
  const { errors } = await buildContent({ contentDir: unknown.dir });
  unknown.done();
  assert.match(
    joined(errors),
    /skills\.yaml: evidence "no-such-thing" is not a known experience or project id/,
  );
});

test('REQ-CONTENT-004 lists sort by order, then newest first', async () => {
  const c = withContent((d) =>
    edit(d, 'projects/helmet-detection.md', (s) => s.replace('order: 40', 'order: 5')),
  );

  const { content } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.equal(content.projects[0].id, 'helmet-detection');
  assert.deepEqual(
    content.metrics.map((m) => m.order),
    [...content.metrics.map((m) => m.order)].sort((a, b) => a - b),
  );
});

test('REQ-CONTENT-004 equal order falls back to the newest start date', async () => {
  const c = withContent((d) => {
    edit(d, 'experience/2024-07-lumu.yaml', (s) => s.replace('order: 20', 'order: 99'));
    edit(d, 'experience/2023-12-iit-bombay.yaml', (s) => s.replace('order: 30', 'order: 99'));
  });

  const { content } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.deepEqual(
    content.experience.slice(-2).map((e) => e.id),
    ['2024-07-lumu', '2023-12-iit-bombay'],
  );
});

test('REQ-PAGE-004 project Markdown is rendered to HTML', async () => {
  const { content } = await buildContent({ contentDir: REAL });

  const lab = content.projects.find((p) => p.id === 'settlement-lab');
  assert.match(lab.html, /<h2[^>]*>The problem<\/h2>/);
  assert.match(lab.html, /<table>/);
  assert.equal(lab.body, undefined);
});

test('REQ-CONTENT-005 employer throughput figures and non-international numbers are rejected', async () => {
  const c = withContent((d) =>
    edit(d, 'experience/2024-11-rebit.yaml', (s) =>
      s.replace('  - Cut database calls', '  - Processed 1,00,000+ TPH.\n  - Cut database calls'),
    ),
  );

  const { errors } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.match(joined(errors), /experience\/2024-11-rebit\.yaml: .*throughput/);
  assert.match(joined(errors), /experience\/2024-11-rebit\.yaml: .*international format/);
});

test('REQ-CONTENT-005 phone numbers and other email addresses are rejected', async () => {
  const c = withContent((d) =>
    edit(d, 'profile.yaml', (s) =>
      s.replace('location: Navi Mumbai, India', 'location: Call +91 98765 43210 or me@example.com'),
    ),
  );

  const { errors } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.match(joined(errors), /profile\.yaml: .*phone/);
  assert.match(joined(errors), /profile\.yaml: .*email/);
});

test('REQ-CONTENT-005 employer names outside the Experience page are rejected', async () => {
  const c = withContent((d) =>
    edit(d, 'profile.yaml', (s) =>
      s.replace('large-value payment systems', 'large-value payment systems at ReBIT'),
    ),
  );

  const { errors } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.match(joined(errors), /profile\.yaml: .*employer name/);
});

test('REQ-SEO-002 the sitemap lists every published route with the site origin, and not /404', async () => {
  const { content } = await buildContent({ contentDir: REAL });

  const xml = sitemapXml(content);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.deepEqual(locs, [
    'https://siddheshfulawade.com/',
    'https://siddheshfulawade.com/experience/',
    'https://siddheshfulawade.com/projects/',
    ...content.projects.map((p) => `https://siddheshfulawade.com/projects/${p.id}/`),
    'https://siddheshfulawade.com/about/',
    'https://siddheshfulawade.com/contact/',
  ]);
  assert.ok(!xml.includes('/404'));
});

test('REQ-SEO-002 REQ-CONTENT-003 an unpublished project is left out of the sitemap', async () => {
  const c = withContent((d) =>
    edit(d, 'projects/pennywise.md', (s) => s.replace('published: true', 'published: false')),
  );

  const { content } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.ok(!sitemapXml(content).includes('/projects/pennywise'));
});

test('REQ-SEO-002 robots.txt allows crawling and points at the sitemap', async () => {
  const { content } = await buildContent({ contentDir: REAL });

  assert.equal(
    robotsTxt(content),
    'User-agent: *\nAllow: /\n\nSitemap: https://siddheshfulawade.com/sitemap.xml\n',
  );
});

const NOTE = `---
id: exactly-once
published: true
updated: 2026-11-25
title: Exactly-once without distributed transactions
summary: How idempotency keys and an outbox give an exactly-once effect.
date: 2026-11-25
tags: [payments, idempotency]
---

${'word '.repeat(450)}
`;
const addNote = (dir, name, text) => {
  mkdirSync(join(dir, 'notes'), { recursive: true });
  writeFileSync(join(dir, 'notes', name), text);
};

test('REQ-NOTE-001 notes build with HTML, reading time, newest first, and unpublished notes dropped', async () => {
  const c = withContent((d) => {
    addNote(d, 'exactly-once.md', NOTE);
    addNote(
      d,
      'older.md',
      NOTE.replace('id: exactly-once', 'id: older').replaceAll('2026-11-25', '2026-11-20'),
    );
    addNote(
      d,
      'draft.md',
      NOTE.replace('id: exactly-once', 'id: draft').replace('published: true', 'published: false'),
    );
  });

  const { content, errors } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.deepEqual(errors, []);
  assert.deepEqual(
    content.notes.map((n) => n.id),
    ['exactly-once', 'older'],
  );
  assert.equal(content.notes[0].readingMinutes, 3);
  assert.match(content.notes[0].html, /<p>word word/);
});

test('REQ-NOTE-001 an invalid note fails with the file and the field', async () => {
  const c = withContent((d) =>
    addNote(d, 'exactly-once.md', NOTE.replace('date: 2026-11-25', 'date: soon')),
  );

  const { errors } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.match(joined(errors), /notes\/exactly-once\.md: \/date /);
});

test('REQ-NOTE-003 a note that names the employer is rejected (employer work stays on the Experience page)', async () => {
  const c = withContent((d) =>
    addNote(d, 'exactly-once.md', NOTE.replace('word word', 'At ReBIT we did this')),
  );

  const { errors } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.match(joined(errors), /notes\/exactly-once\.md: .*employer name/);
});

test('REQ-NOTE-002 with no published notes, Notes is left out of the navigation and the sitemap', async () => {
  const { content } = await buildContent({ contentDir: REAL });

  assert.deepEqual(content.notes, []);
  assert.ok(!content.site.nav.some((n) => n.path === '/notes'));
  assert.ok(!sitemapXml(content).includes('/notes'));
});

test('REQ-NOTE-002 published notes appear in the navigation and the sitemap', async () => {
  const c = withContent((d) => addNote(d, 'exactly-once.md', NOTE));

  const { content } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.ok(content.site.nav.some((n) => n.path === '/notes'));
  assert.match(sitemapXml(content), /\/notes\/<\/loc>[\s\S]*\/notes\/exactly-once\/<\/loc>/);
});

// The shipped profile has no resume (v1), so these tests add one.
const withResume = (s) => `${s.trimEnd()}
resume:
  label: Resume (PDF)
  url: /resume.pdf
`;

const dropResume = (s) => s.replace(/^resume:\r?\n(?:[ \t]+.*\r?\n?)+/m, '');

test('REQ-PAGE-008 a profile without resume validates', async () => {
  const c = withContent((d) => edit(d, 'profile.yaml', dropResume));

  const { content, errors } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.deepEqual(errors, []);
  assert.equal(content.profile.resume, undefined);
});

test('REQ-PAGE-008 a malformed resume still fails with the file and the field', async () => {
  const noUrl = withContent((d) =>
    edit(d, 'profile.yaml', (s) => withResume(s).replace(/^ {2}url: \/resume\.pdf\r?\n/m, '')),
  );
  const missing = await buildContent({ contentDir: noUrl.dir });
  noUrl.done();
  assert.match(joined(missing.errors), /profile\.yaml: \/resume must have required property 'url'/);

  const extra = withContent((d) =>
    edit(d, 'profile.yaml', (s) =>
      withResume(s).replace('  url: /resume.pdf', '  url: /resume.pdf\n  size: big'),
    ),
  );
  const extras = await buildContent({ contentDir: extra.dir });
  extra.done();
  assert.match(joined(extras.errors), /profile\.yaml: \/resume /);
});
