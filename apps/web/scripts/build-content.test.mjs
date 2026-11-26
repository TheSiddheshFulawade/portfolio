// Spec 002 V1-02: content build. Each test copies the real content/ to a temp dir and changes one thing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml, stringify } from 'yaml';
import { buildContent, main, robotsTxt, sitemapXml } from './build-content.mjs';

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
    edit(d, 'skills.yaml', (s) => s.replace(/evidence: \[[^\]]+\]/, 'evidence: [no-such-thing]')),
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
      s.replace('Cut database calls', 'Processed 1,00,000+ TPH. Cut database calls'),
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
      s.replace('I build payment software', 'I build payment software at ReBIT'),
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

// ---------------------------------------------------------------------------------------------
// Spec 005 RD-03: redesign content model. Fixtures are written into the temp copy so each test
// states the exact shape it relies on; assertions look only at the file under test.
// ---------------------------------------------------------------------------------------------
const writeYaml = (dir, file, obj) => {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), stringify(obj));
};
const editYaml = (dir, file, fn) => {
  const data = parseYaml(readFileSync(join(dir, file), 'utf8'));
  fn(data);
  writeYaml(dir, file, data);
};
/** Errors reported for one file. */
const errsFor = (errors, file) => errors.filter((e) => e.startsWith(`${file}:`));
const META = { published: true, updated: '2026-11-24' };

const DECISION = {
  id: 'ordered-locking',
  order: 10,
  title: 'Lock accounts in a fixed order',
  choice: 'Take both account locks in ascending id order.',
  rejected: 'Optimistic retries on every transfer.',
  reason: 'A fixed order makes a lock cycle impossible.',
  cost: 'Contention on hot accounts.',
  evidence: [{ label: 'Settlement Lab', ref: 'settlement-lab' }],
};
const decisionsFile = (...items) => ({ id: 'decisions', ...META, items });
const withDecisions = (items, mutate) =>
  withContent((d) => {
    writeYaml(d, 'decisions.yaml', decisionsFile(...items));
    mutate?.(d);
  });

test('REQ-HOME-105 a complete decision builds into the home data, sorted by order', async () => {
  const c = withDecisions([
    { ...DECISION, id: 'second', order: 20 },
    { ...DECISION, id: 'first', order: 10 },
  ]);
  const { home, errors } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.deepEqual(errsFor(errors, 'decisions.yaml'), []);
  assert.deepEqual(
    home.decisions.map((x) => x.id),
    ['first', 'second'],
  );
  assert.equal(home.decisions[0].cost, DECISION.cost);
});

for (const field of ['cost', 'rejected', 'reason', 'choice', 'title', 'evidence']) {
  test(`REQ-HOME-105 a decision without ${field} fails the build naming file and field`, async () => {
    const { [field]: _gone, ...partial } = DECISION;
    const c = withDecisions([partial]);
    const { errors } = await buildContent({ contentDir: c.dir });
    c.done();

    assert.match(
      joined(errors),
      new RegExp(`decisions\\.yaml: /items/0 must have required property '${field}'`),
    );
  });
}

test('REQ-HOME-105 a decision with empty evidence, or evidence with neither ref nor url, fails', async () => {
  const empty = withDecisions([{ ...DECISION, evidence: [] }]);
  const a = await buildContent({ contentDir: empty.dir });
  empty.done();
  assert.match(
    joined(a.errors),
    /decisions\.yaml: \/items\/0\/evidence must NOT have fewer than 1 items/,
  );

  const bare = withDecisions([{ ...DECISION, evidence: [{ label: 'Trust me' }] }]);
  const b = await buildContent({ contentDir: bare.dir });
  bare.done();
  assert.match(joined(b.errors), /decisions\.yaml: \/items\/0\/evidence\/0 /);
});

test('REQ-HOME-105 a url evidence entry is accepted, and an http url is not', async () => {
  const ok = withDecisions([
    { ...DECISION, evidence: [{ label: 'Repo', url: 'https://github.com/x/y' }] },
  ]);
  const a = await buildContent({ contentDir: ok.dir });
  ok.done();
  assert.deepEqual(errsFor(a.errors, 'decisions.yaml'), []);

  const bad = withDecisions([{ ...DECISION, evidence: [{ label: 'Repo', url: 'http://x.test' }] }]);
  const b = await buildContent({ contentDir: bad.dir });
  bad.done();
  assert.match(joined(b.errors), /decisions\.yaml: \/items\/0\/evidence\/0\/url /);
});

test('REQ-HOME-105 a missing decisions.yaml fails the build', async () => {
  const c = withContent((d) => rmSync(join(d, 'decisions.yaml'), { force: true }));
  const { errors } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.match(joined(errors), /decisions\.yaml: file is missing/);
});

test('REQ-HOME-105 the real decisions all carry choice, rejected, reason, cost and evidence', async () => {
  const { home, errors } = await buildContent({ contentDir: REAL });

  assert.deepEqual(errsFor(errors, 'decisions.yaml'), []);
  assert.ok(home.decisions.length >= 3);
  for (const x of home.decisions) {
    for (const f of ['choice', 'rejected', 'reason', 'cost'])
      assert.ok(x[f]?.length > 0, `${x.id}.${f}`);
    assert.ok(x.evidence.length >= 1, `${x.id} evidence`);
  }
});

// --- skills: four capability groups, evidence decides what is shown -------------------------
const skillsFile = (skillsByGroup) => ({
  id: 'skills',
  ...META,
  groups: skillsByGroup.map((skills, i) => ({
    id: `group-${i + 1}`,
    order: (i + 1) * 10,
    label: `Group ${i + 1}`,
    skills,
  })),
});
const S = (name, ...evidence) => ({ name, evidence });
const FOUR = [
  [S('Java', '2024-11-rebit', 'settlement-lab')],
  [S('Kafka', '2024-11-rebit')],
  [S('Azure', '2024-07-lumu')],
  [S('Python', 'pennywise')],
];
const withSkills = (groups, mutate) =>
  withContent((d) => {
    writeYaml(d, 'skills.yaml', skillsFile(groups));
    mutate?.(d);
  });
const shown = (content) => content.skills.flatMap((g) => g.skills.map((s) => s.name));

test('REQ-ABOUT-101 exactly four capability groups are required', async () => {
  const three = withSkills(FOUR.slice(0, 3));
  const a = await buildContent({ contentDir: three.dir });
  three.done();
  assert.match(joined(a.errors), /skills\.yaml: \/groups must NOT have fewer than 4 items/);

  const five = withSkills([...FOUR, [S('Redis', 'pennywise')]]);
  const b = await buildContent({ contentDir: five.dir });
  five.done();
  assert.match(joined(b.errors), /skills\.yaml: \/groups must NOT have more than 4 items/);
});

test('REQ-ABOUT-101 a group may carry an optional summary', async () => {
  const c = withSkills(FOUR, (d) =>
    editYaml(d, 'skills.yaml', (y) => (y.groups[0].summary = 'What I build with.')),
  );
  const { content, errors } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.deepEqual(errsFor(errors, 'skills.yaml'), []);
  assert.equal(content.skills[0].summary, 'What I build with.');
});

test('REQ-ABOUT-101 a skill whose evidence is empty is hidden, the others stay', async () => {
  const c = withSkills([[S('Java', '2024-11-rebit'), S('Cobol')], ...FOUR.slice(1)]);
  const { content, errors } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.deepEqual(errsFor(errors, 'skills.yaml'), []);
  assert.ok(shown(content).includes('Java'));
  assert.ok(!shown(content).includes('Cobol'));
});

test('REQ-ABOUT-101 a skill whose only evidence is unpublished is hidden too', async () => {
  const c = withSkills(FOUR, (d) =>
    edit(d, 'projects/pennywise.md', (s) => s.replace('published: true', 'published: false')),
  );
  const { content } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.ok(!shown(content).includes('Python'));
});

test('REQ-ABOUT-101 a group left with no visible skill is hidden', async () => {
  const c = withSkills([[S('Java', '2024-11-rebit')], [S('Kafka')], FOUR[2], FOUR[3]]);
  const { content, errors } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.deepEqual(errsFor(errors, 'skills.yaml'), []);
  assert.deepEqual(
    content.skills.map((g) => g.id),
    ['group-1', 'group-3', 'group-4'],
  );
});

test('REQ-ABOUT-101 the evidence id "site" is allowed and kept, and no output skill has empty evidence', async () => {
  const c = withSkills([
    [S('TypeScript', 'site'), S('Angular', 'site', 'settlement-lab')],
    ...FOUR.slice(1),
  ]);
  const { content, errors } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.deepEqual(errsFor(errors, 'skills.yaml'), []);
  const ts = content.skills[0].skills.find((s) => s.name === 'TypeScript');
  assert.deepEqual(ts.evidence, ['site']);
  for (const g of content.skills) for (const s of g.skills) assert.ok(s.evidence.length > 0);
});

test('REQ-ABOUT-101 an evidence id that is not an experience, project or "site" fails', async () => {
  const c = withSkills([[S('Java', 'no-such-thing')], ...FOUR.slice(1)]);
  const { errors } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.match(joined(errors), /skills\.yaml: evidence "no-such-thing" is not a known/);
});

test('REQ-ABOUT-101 the real skills form four groups and every shown skill has evidence', async () => {
  const { content, errors } = await buildContent({ contentDir: REAL });

  assert.deepEqual(errsFor(errors, 'skills.yaml'), []);
  assert.equal(content.skills.length, 4);
  for (const g of content.skills)
    for (const s of g.skills) assert.ok(s.evidence.length > 0, s.name);
});

// --- experience highlights grouped by theme --------------------------------------------------
const REBIT = 'experience/2024-11-rebit.yaml';
const withHighlights = (highlights) =>
  withContent((d) => editYaml(d, REBIT, (y) => (y.highlights = highlights)));

test('REQ-EXP-101 highlights are grouped by theme and keep their order', async () => {
  const highlights = [
    { theme: 'Correctness', items: ['Second item.', 'First item.'] },
    { theme: 'Delivery', items: ['Only item.'] },
    { theme: 'Aardvark', items: ['Sorted last on purpose.'] },
  ];
  const c = withHighlights(highlights);
  const { content, errors } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.deepEqual(errsFor(errors, REBIT), []);
  assert.deepEqual(content.experience.find((e) => e.id === '2024-11-rebit').highlights, highlights);
});

test('REQ-EXP-101 a theme with no items, or without a name, fails with file and field', async () => {
  const empty = withHighlights([{ theme: 'Correctness', items: [] }]);
  const a = await buildContent({ contentDir: empty.dir });
  empty.done();
  assert.match(
    joined(a.errors),
    /experience\/2024-11-rebit\.yaml: \/highlights\/0\/items must NOT have fewer than 1 items/,
  );

  const noTheme = withHighlights([{ items: ['x'] }]);
  const b = await buildContent({ contentDir: noTheme.dir });
  noTheme.done();
  assert.match(
    joined(b.errors),
    /experience\/2024-11-rebit\.yaml: \/highlights\/0 must have required property 'theme'/,
  );
});

test('REQ-EXP-101 a flat list of highlights no longer validates', async () => {
  const c = withHighlights(['A plain string.']);
  const { errors } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.match(joined(errors), /experience\/2024-11-rebit\.yaml: \/highlights\/0 /);
});

test('REQ-EXP-101 the real roles all use themed highlights', async () => {
  const { content, errors } = await buildContent({ contentDir: REAL });

  assert.deepEqual(errsFor(errors, REBIT), []);
  for (const e of content.experience) {
    assert.ok(e.highlights.length >= 1);
    for (const h of e.highlights) assert.ok(h.theme && h.items.length >= 1, e.id);
  }
});

// --- PayFlow project and REQ-ACC-005 ---------------------------------------------------------
const payflow = (front, body = '\n## Status\n\nIn development.\n') =>
  `---\n${stringify({
    id: 'payflow',
    ...META,
    featured: true,
    order: 20,
    title: 'PayFlow',
    tagline: 'Payments as sagas across services.',
    status: 'In development',
    stack: ['Java'],
    ...front,
  })}---\n${body}`;
const withPayflow = (front, body) =>
  withContent((d) => writeFileSync(join(d, 'projects/payflow.md'), payflow(front, body)));
const PF = 'projects/payflow.md';

test('REQ-ACC-005 an in-development project lists what is proven and what is planned', async () => {
  const c = withPayflow({
    phase: 'in-development',
    proven: ['Wallet debit is idempotent (merged tests).'],
    planned: ['Risk service is specified, not built.'],
  });
  const { content, errors } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.deepEqual(errsFor(errors, PF), []);
  const p = content.projects.find((x) => x.id === 'payflow');
  assert.equal(p.phase, 'in-development');
  assert.deepEqual(p.proven, ['Wallet debit is idempotent (merged tests).']);
  assert.deepEqual(p.planned, ['Risk service is specified, not built.']);
});

test('REQ-ACC-005 an in-development project without proven or planned fails', async () => {
  const noPlanned = withPayflow({ phase: 'in-development', proven: ['x'] });
  const a = await buildContent({ contentDir: noPlanned.dir });
  noPlanned.done();
  assert.match(joined(a.errors), /projects\/payflow\.md: \/ must have required property 'planned'/);

  const noProven = withPayflow({ phase: 'in-development', planned: ['x'] });
  const b = await buildContent({ contentDir: noProven.dir });
  noProven.done();
  assert.match(joined(b.errors), /projects\/payflow\.md: \/ must have required property 'proven'/);

  const emptyProven = withPayflow({ phase: 'in-development', proven: [], planned: ['x'] });
  const e = await buildContent({ contentDir: emptyProven.dir });
  emptyProven.done();
  assert.match(joined(e.errors), /projects\/payflow\.md: \/proven /);
});

test('REQ-ACC-005 a released project needs no planned list, and an unknown phase fails', async () => {
  const released = withPayflow({ phase: 'released' });
  const a = await buildContent({ contentDir: released.dir });
  released.done();
  assert.deepEqual(errsFor(a.errors, PF), []);

  const bad = withPayflow({ phase: 'beta' });
  const b = await buildContent({ contentDir: bad.dir });
  bad.done();
  assert.match(joined(b.errors), /projects\/payflow\.md: \/phase /);
});

test('REQ-PROJ-101 the real PayFlow project is published, featured and in development with proven and planned lists', async () => {
  const { content, errors } = await buildContent({ contentDir: REAL });

  assert.deepEqual(errsFor(errors, PF), []);
  const p = content.projects.find((x) => x.id === 'payflow');
  assert.ok(p, 'payflow project missing');
  assert.equal(p.phase, 'in-development');
  assert.ok(p.featured);
  assert.ok(p.proven.length >= 1 && p.planned.length >= 1);
});

// --- measured results (REQ-PROJ-104, REQ-ACC-004) -------------------------------------------
const ROW = {
  ledger: 'LOCKING',
  threads: 'PLATFORM',
  fault: 'NONE',
  transfers: 100000,
  submissionsPerSecond: 248861,
  p50Us: 183,
  p99Us: 2008,
  rejected: 853,
  duplicates: 2006,
  retries: 0,
  breakerOpens: 0,
  outboxPeak: 0,
  invariantsPassed: true,
};
const RESULT = {
  id: 'settlement-lab',
  ...META,
  measured: 'Submissions answered by the engine per second, duplicates and rejections included.',
  machine: 'Intel Xeon @ 2.10 GHz',
  os: 'Linux amd64',
  cores: 4,
  jdk: '21.0.13 (Ubuntu)',
  runs: 1,
  runDate: '2026-11-20',
  workload: '100,000 transfers per row; 2% duplicates.',
  source: {
    repo: 'https://github.com/TheSiddheshFulawade/settlement-lab',
    commit: '3eb119a',
    path: 'results/results.json',
  },
  rows: [ROW],
};
const RES = 'results/settlement-lab.yaml';
const withResult = (mutate) =>
  withContent((d) => {
    const r = structuredClone(RESULT);
    mutate?.(r);
    writeYaml(d, RES, r);
  });

test('REQ-PROJ-104 a complete result builds into the results data, keyed by id', async () => {
  const c = withResult();
  const { results, content, errors } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.deepEqual(errsFor(errors, RES), []);
  assert.equal(results['settlement-lab'].rows[0].submissionsPerSecond, 248861);
  assert.equal(results['settlement-lab'].source.commit, '3eb119a');
  assert.equal(content.results, undefined);
});

for (const fact of [
  'measured',
  'machine',
  'os',
  'cores',
  'jdk',
  'runs',
  'runDate',
  'workload',
  'source',
  'rows',
]) {
  test(`REQ-ACC-004 a result without ${fact} fails the build naming file and field`, async () => {
    const c = withResult((r) => delete r[fact]);
    const { errors } = await buildContent({ contentDir: c.dir });
    c.done();

    assert.match(
      joined(errors),
      new RegExp(`results/settlement-lab\\.yaml: / must have required property '${fact}'`),
    );
  });
}

for (const part of ['repo', 'commit', 'path']) {
  test(`REQ-ACC-004 a result source without ${part} fails`, async () => {
    const c = withResult((r) => delete r.source[part]);
    const { errors } = await buildContent({ contentDir: c.dir });
    c.done();

    assert.match(
      joined(errors),
      new RegExp(`results/settlement-lab\\.yaml: /source must have required property '${part}'`),
    );
  });
}

test('REQ-ACC-004 the commit must be 7 to 40 hex characters', async () => {
  for (const commit of ['main', 'abc12', 'XYZ1234', 'a'.repeat(41)]) {
    const c = withResult((r) => (r.source.commit = commit));
    const { errors } = await buildContent({ contentDir: c.dir });
    c.done();
    assert.match(joined(errors), /results\/settlement-lab\.yaml: \/source\/commit /, commit);
  }
  for (const commit of ['3eb119a', 'a'.repeat(40)]) {
    const c = withResult((r) => (r.source.commit = commit));
    const { errors } = await buildContent({ contentDir: c.dir });
    c.done();
    assert.deepEqual(errsFor(errors, RES), [], commit);
  }
});

test('REQ-PROJ-104 each row needs the measured columns; an empty table fails', async () => {
  const { submissionsPerSecond: _a, ...noRate } = ROW;
  const a = withResult((r) => (r.rows = [noRate]));
  const ra = await buildContent({ contentDir: a.dir });
  a.done();
  assert.match(
    joined(ra.errors),
    /results\/settlement-lab\.yaml: \/rows\/0 must have required property 'submissionsPerSecond'/,
  );

  const { p99Us: _b, ...noP99 } = ROW;
  const b = withResult((r) => (r.rows = [noP99]));
  const rb = await buildContent({ contentDir: b.dir });
  b.done();
  assert.match(joined(rb.errors), /\/rows\/0 must have required property 'p99Us'/);

  const e = withResult((r) => (r.rows = []));
  const re = await buildContent({ contentDir: e.dir });
  e.done();
  assert.match(
    joined(re.errors),
    /results\/settlement-lab\.yaml: \/rows must NOT have fewer than 1 items/,
  );
});

test('REQ-PROJ-104 the old "throughputPerSecond" name is rejected: rates are named for what they measure', async () => {
  const c = withResult((r) => (r.rows = [{ ...ROW, throughputPerSecond: 1 }]));
  const { errors } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.match(
    joined(errors),
    /results\/settlement-lab\.yaml: \/rows\/0 must NOT have additional properties/,
  );
});

test('REQ-PROJ-104 the real result is the 12-row run at commit 3eb119a', async () => {
  const { results, errors } = await buildContent({ contentDir: REAL });

  assert.deepEqual(errsFor(errors, RES), []);
  const r = results['settlement-lab'];
  assert.ok(r, 'results/settlement-lab.yaml missing');
  assert.equal(r.source.commit, '3eb119a');
  assert.equal(r.cores, 4);
  assert.equal(r.rows.length, 12);
  const first = r.rows[0];
  assert.deepEqual(
    [first.ledger, first.threads, first.fault, first.submissionsPerSecond, first.p99Us],
    ['LOCKING', 'PLATFORM', 'NONE', 248861, 2008],
  );
});

// --- site hero and section labels ------------------------------------------------------------
const HERO = {
  lead: 'I build payment systems',
  phrases: ['that stay correct', 'that recover'],
  srSentence: 'I build payment systems that stay correct.',
};
const SECTIONS = {
  selected: 'Selected systems',
  experience: 'Experience',
  decisions: 'Decisions',
  capabilities: 'Capabilities',
  contact: 'Contact',
};
const withSite = (mutate) =>
  withContent((d) =>
    editYaml(d, 'site.yaml', (y) => {
      y.hero = structuredClone(HERO);
      y.sections = structuredClone(SECTIONS);
      mutate?.(y);
    }),
  );
const siteErrs = (errors) => errors.filter((e) => /^site\.yaml: \/(hero|sections)/.test(e));

test('REQ-HOME-101 a hero with 2 to 5 phrases and a screen-reader sentence builds into site', async () => {
  for (const n of [2, 5]) {
    const c = withSite(
      (y) => (y.hero.phrases = Array.from({ length: n }, (_, i) => `phrase ${i}`)),
    );
    const { content, errors } = await buildContent({ contentDir: c.dir });
    c.done();
    assert.deepEqual(siteErrs(errors), [], `${n} phrases`);
    assert.equal(content.site.hero.phrases.length, n);
  }
});

test('REQ-HOME-101 fewer than 2 or more than 5 phrases fails', async () => {
  const one = withSite((y) => (y.hero.phrases = ['alone']));
  const a = await buildContent({ contentDir: one.dir });
  one.done();
  assert.match(joined(a.errors), /site\.yaml: \/hero\/phrases must NOT have fewer than 2 items/);

  const six = withSite((y) => (y.hero.phrases = ['1', '2', '3', '4', '5', '6']));
  const b = await buildContent({ contentDir: six.dir });
  six.done();
  assert.match(joined(b.errors), /site\.yaml: \/hero\/phrases must NOT have more than 5 items/);
});

test('REQ-HOME-101 a hero without lead, phrases or srSentence fails naming the field', async () => {
  for (const field of ['lead', 'srSentence', 'phrases']) {
    const c = withSite((y) => delete y.hero[field]);
    const { errors } = await buildContent({ contentDir: c.dir });
    c.done();
    assert.match(
      joined(errors),
      new RegExp(`site\\.yaml: /hero must have required property '${field}'`),
    );
  }
});

test('REQ-HOME-104 the section labels for the Home sections are required', async () => {
  for (const key of Object.keys(SECTIONS)) {
    const c = withSite((y) => delete y.sections[key]);
    const { errors } = await buildContent({ contentDir: c.dir });
    c.done();
    assert.match(
      joined(errors),
      new RegExp(`site\\.yaml: /sections must have required property '${key}'`),
    );
  }
});

test('REQ-HOME-101 the real site.yaml has the hero and section labels', async () => {
  const { content, errors } = await buildContent({ contentDir: REAL });

  assert.deepEqual(siteErrs(errors), []);
  assert.ok(content.site.hero.phrases.length >= 2);
  assert.ok(content.site.sections.decisions);
});

// --- site.field: copy of the invariant field (REQ-HOME-103) -----------------------------------
const FIELD = {
  heading: 'A ledger that heals',
  intro: ['A browser illustration of double entry.', 'Break it and watch it recover.'],
  actions: { node: 'Drop a node', partition: 'Partition', duplicate: 'Deliver twice' },
  counters: {
    committed: 'Committed',
    reachable: 'Reachable',
    unreachable: 'Unreachable',
    recovering: 'Recovering',
    duplicates: 'Duplicate transactions not applied',
    net: 'Debits minus credits',
  },
  status: {
    rest: 'At rest.',
    node: 'Node down.',
    nodeDone: 'Replayed from the log. Net still zero.',
    partition: 'Partitioned.',
    partitionDone: 'Link restored.',
    duplicate: 'Delivered again.',
    duplicateDone: 'Nothing was applied a second time.',
  },
  caption: 'A simplified model.',
};
const withField = (mutate) =>
  withContent((d) =>
    editYaml(d, 'site.yaml', (y) => {
      y.hero = structuredClone(HERO);
      y.sections = structuredClone(SECTIONS);
      y.field = structuredClone(FIELD);
      mutate?.(y);
    }),
  );
const fieldErrs = (errors) => errors.filter((e) => /^site\.yaml: \/field/.test(e));

test('REQ-HOME-103 a complete site.field builds into site.field without errors', async () => {
  const c = withField();

  const { content, errors } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.deepEqual(fieldErrs(errors), []);
  assert.equal(content.site.field.heading, FIELD.heading);
  assert.deepEqual(content.site.field.intro, FIELD.intro);
  assert.equal(content.site.field.actions.node, FIELD.actions.node);
});

test('REQ-HOME-103 a site.yaml without site.field fails the build', async () => {
  const c = withContent((d) =>
    editYaml(d, 'site.yaml', (y) => {
      y.hero = structuredClone(HERO);
      y.sections = structuredClone(SECTIONS);
      delete y.field;
    }),
  );

  const { errors } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.match(joined(errors), /site\.yaml: \/ must have required property 'field'/);
});

for (const key of ['heading', 'intro', 'actions', 'counters', 'status', 'caption']) {
  test(`REQ-HOME-103 a site.field without ${key} fails the build, naming it`, async () => {
    const c = withField((y) => delete y.field[key]);

    const { errors } = await buildContent({ contentDir: c.dir });
    c.done();

    assert.match(
      joined(errors),
      new RegExp(`site\\.yaml: /field must have required property '${key}'`),
    );
  });
}

for (const [group, keys] of [
  ['actions', Object.keys(FIELD.actions)],
  ['counters', Object.keys(FIELD.counters)],
  ['status', Object.keys(FIELD.status)],
]) {
  for (const key of keys) {
    test(`REQ-HOME-103 a site.field.${group} without ${key} fails the build, naming it`, async () => {
      const c = withField((y) => delete y.field[group][key]);

      const { errors } = await buildContent({ contentDir: c.dir });
      c.done();

      assert.match(
        joined(errors),
        new RegExp(`site\\.yaml: /field/${group} must have required property '${key}'`),
      );
    });
  }
}

test('REQ-HOME-103 site.field.intro must be a non-empty list of paragraphs, and a label must not be empty', async () => {
  const cases = [
    ['intro as a string', withField((y) => (y.field.intro = 'one paragraph as a string'))],
    ['empty intro', withField((y) => (y.field.intro = []))],
    ['empty label', withField((y) => (y.field.counters.committed = ''))],
  ];

  for (const [name, c] of cases) {
    const { errors } = await buildContent({ contentDir: c.dir });
    c.done();
    assert.notDeepEqual(fieldErrs(errors), [], name);
  }
});

// --- profile photo (REQ-UI-105) --------------------------------------------------------------
const PHOTO = {
  src: '/portrait.jpg',
  alt: 'Siddhesh Fulawade at his desk',
  width: 800,
  height: 1000,
};
function withPhoto(photo, { bytes = 30 * 1024 } = {}) {
  const pub = mkdtempSync(join(tmpdir(), 'public-'));
  if (bytes !== null) writeFileSync(join(pub, 'portrait.jpg'), Buffer.alloc(bytes, 1));
  const c = withContent((d) => editYaml(d, 'profile.yaml', (y) => (y.photo = photo)));
  return {
    dir: c.dir,
    pub,
    done: () => (c.done(), rmSync(pub, { recursive: true, force: true })),
  };
}
const photoErrs = (errors) => errors.filter((e) => /^profile\.yaml: .*photo/i.test(e));

test('REQ-UI-105 a 4:5 photo under 60 KB that exists builds into the profile', async () => {
  const c = withPhoto(PHOTO);
  const { content, errors } = await buildContent({ contentDir: c.dir, publicDir: c.pub });
  c.done();

  assert.deepEqual(photoErrs(errors), []);
  assert.deepEqual(content.profile.photo, PHOTO);
});

test('REQ-UI-105 no photo means nothing is emitted', async () => {
  const c = withContent((d) => editYaml(d, 'profile.yaml', (y) => delete y.photo));
  const { content, errors } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.deepEqual(photoErrs(errors), []);
  assert.equal('photo' in content.profile, false);
});

test('REQ-UI-105 a photo file that does not exist fails', async () => {
  const c = withPhoto(PHOTO, { bytes: null });
  const { errors } = await buildContent({ contentDir: c.dir, publicDir: c.pub });
  c.done();

  assert.match(
    joined(errors),
    /profile\.yaml: .*photo.*\/portrait\.jpg.*(not found|does not exist)/i,
  );
});

test('REQ-UI-105 a photo of 60 KB or more fails, one just under passes', async () => {
  const big = withPhoto(PHOTO, { bytes: 60 * 1024 });
  const a = await buildContent({ contentDir: big.dir, publicDir: big.pub });
  big.done();
  assert.match(joined(a.errors), /profile\.yaml: .*photo.*60 KB/i);

  const edge = withPhoto(PHOTO, { bytes: 60 * 1024 - 1 });
  const b = await buildContent({ contentDir: edge.dir, publicDir: edge.pub });
  edge.done();
  assert.deepEqual(photoErrs(b.errors), []);
});

test('REQ-UI-105 a photo that is not 4:5 fails', async () => {
  const c = withPhoto({ ...PHOTO, width: 1000, height: 1000 });
  const { errors } = await buildContent({ contentDir: c.dir, publicDir: c.pub });
  c.done();

  assert.match(joined(errors), /profile\.yaml: .*photo.*4:5/i);
});

test('REQ-UI-105 a photo needs non-empty alt text, width and height', async () => {
  const noAlt = withPhoto({ ...PHOTO, alt: '' });
  const a = await buildContent({ contentDir: noAlt.dir, publicDir: noAlt.pub });
  noAlt.done();
  assert.match(joined(a.errors), /profile\.yaml: \/photo\/alt /);

  const { width: _w, ...noWidth } = PHOTO;
  const missing = withPhoto(noWidth);
  const b = await buildContent({ contentDir: missing.dir, publicDir: missing.pub });
  missing.done();
  assert.match(joined(b.errors), /profile\.yaml: \/photo must have required property 'width'/);
});

// --- disclosure: work-history names stay inside content/experience ---------------------------
const profileWith = (text) =>
  withContent((d) => edit(d, 'profile.yaml', (s) => s.replace('I build payment software', text)));

test('REQ-CONTENT-005 every employer or institute from the work history is rejected outside Experience', async () => {
  for (const name of [
    'ReBIT',
    'e-Kuber',
    'Reserve Bank',
    'IIT Bombay',
    'IITB',
    'NanoBios',
    'Lumu',
  ]) {
    const c = profileWith(`I worked with ${name} and I build payment software`);
    const { errors } = await buildContent({ contentDir: c.dir });
    c.done();
    assert.match(joined(errors), /profile\.yaml: .*employer name/, name);
  }
});

test('REQ-CONTENT-005 the same names are allowed inside content/experience', async () => {
  const f = 'experience/2023-12-iit-bombay.yaml';
  const c = withContent((d) =>
    editYaml(d, f, (y) => (y.summary = 'Four projects at the IIT Bombay NanoBios Lab, IITB.')),
  );
  const { errors } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.deepEqual(
    errsFor(errors, f).filter((e) => /employer/.test(e)),
    [],
  );
});

test('REQ-CONTENT-005 a company named in content/experience becomes a banned word elsewhere', async () => {
  for (const text of ['Formerly at Zorblax Systems.', 'ZBX alumnus.']) {
    const c = withContent((d) => {
      editYaml(d, 'experience/2024-07-lumu.yaml', (y) => (y.company = 'Zorblax Systems (ZBX)'));
      edit(d, 'profile.yaml', (s) =>
        s.replace('I build payment software', `${text} I build payment software`),
      );
    });
    const { errors } = await buildContent({ contentDir: c.dir });
    c.done();
    assert.match(joined(errors), /profile\.yaml: .*employer name/, text);
  }
});

test('REQ-CONTENT-005 ids that contain an employer word, such as 2024-11-rebit, still pass as references', async () => {
  const c = withDecisions([{ ...DECISION, evidence: [{ label: 'Role', ref: '2024-11-rebit' }] }]);
  const { errors } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.deepEqual(errsFor(errors, 'decisions.yaml'), []);
});

test('REQ-CONTENT-005 an employer name in a decision, a project body or a result is rejected', async () => {
  const dec = withDecisions([{ ...DECISION, reason: 'We learned it at ReBIT.' }]);
  const a = await buildContent({ contentDir: dec.dir });
  dec.done();
  assert.match(joined(errsFor(a.errors, 'decisions.yaml')), /employer name/);

  const body = withPayflow({ phase: 'released' }, '\nBuilt after the IIT Bombay internship.\n');
  const b = await buildContent({ contentDir: body.dir });
  body.done();
  assert.match(joined(errsFor(b.errors, PF)), /employer name/);

  const res = withResult((r) => (r.workload = 'Same shape as the e-Kuber flow.'));
  const r = await buildContent({ contentDir: res.dir });
  res.done();
  assert.match(joined(errsFor(r.errors, RES)), /employer name/);
});

test('REQ-CONTENT-005 education.yaml names no employer or institute from the work history', async () => {
  const { errors } = await buildContent({ contentDir: REAL });
  const raw = readFileSync(join(REAL, 'education.yaml'), 'utf8');

  assert.deepEqual(errsFor(errors, 'education.yaml'), []);
  assert.doesNotMatch(raw, /ReBIT|e-Kuber|Reserve Bank|IIT Bombay|IITB|NanoBios|Lumu/);
});

test('REQ-CONTENT-005 a different institute with a similar name (IIT Kharagpur) is not flagged', async () => {
  const c = withContent((d) =>
    editYaml(d, 'education.yaml', (y) => {
      y.achievements = y.achievements.filter((a) => !/IIT Bombay/.test(a.text));
    }),
  );
  const { errors } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.deepEqual(errsFor(errors, 'education.yaml'), []);
});

// --- generated output split (REQ-PERF-101) ---------------------------------------------------
test('REQ-PERF-101 decisions and results are not part of the shell content', async () => {
  const c = withDecisions([DECISION], (d) => writeYaml(d, RES, RESULT));
  const { content, home, results } = await buildContent({ contentDir: c.dir });
  c.done();

  assert.equal(content.decisions, undefined);
  assert.equal(content.results, undefined);
  assert.ok(!JSON.stringify(content).includes(DECISION.cost));
  assert.ok(!JSON.stringify(content).includes(RESULT.workload));
  assert.equal(home.decisions[0].id, DECISION.id);
  assert.equal(results['settlement-lab'].rows.length, 1);
  assert.ok(content.site && content.profile && content.skills && content.experience);
});

function generatedPaths() {
  const out = mkdtempSync(join(tmpdir(), 'gen-'));
  return {
    out,
    files: {
      out: join(out, 'content.json'),
      homeOut: join(out, 'home.json'),
      resultsOut: join(out, 'results.json'),
    },
  };
}

test('REQ-PERF-101 main writes content.json, home.json and results.json; the shell file holds neither page-only dataset', async () => {
  const { out, files } = generatedPaths();
  const pub = mkdtempSync(join(tmpdir(), 'public-'));
  const logs = [];
  const log = (m) => logs.push(m);
  const code = await main([], { ...files, publicDir: pub, log, error: log });
  try {
    assert.equal(code, 0, logs.join('\n'));
    const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
    const shell = read(files.out);
    const home = read(files.homeOut);
    const results = read(files.resultsOut);
    assert.ok(home.decisions.length >= 3);
    assert.ok(results['settlement-lab'].rows.length >= 1);
    assert.equal(shell.decisions, undefined);
    assert.equal(shell.results, undefined);
    assert.ok(!readFileSync(files.out, 'utf8').includes(home.decisions[0].cost));
    assert.equal(shell.skills.length, 4);
    assert.equal(shell.site.hero, undefined);
    assert.equal(shell.site.field, undefined);
    assert.equal(shell.site.sections.selected, undefined);
    assert.ok(shell.site.sections.capabilitiesIntro);
    assert.ok(home.hero && home.sections && home.field);
    assert.ok(home.ui.seeSystems);
    assert.equal(shell.site.ui.seeSystems, undefined);
    assert.ok(!readFileSync(files.out, 'utf8').includes(home.field.intro[0]));
  } finally {
    rmSync(out, { recursive: true, force: true });
    rmSync(pub, { recursive: true, force: true });
  }
});

test('REQ-PERF-101 --check writes none of the generated files', async () => {
  const { out, files } = generatedPaths();
  const quiet = () => {};
  await main(['--check'], { ...files, log: quiet, error: quiet });
  const wrote = ['content.json', 'home.json', 'results.json'].filter((f) =>
    existsSync(join(out, f)),
  );
  rmSync(out, { recursive: true, force: true });

  assert.deepEqual(wrote, []);
});

// --- experience.homeSummary: what Home shows instead of `summary` (REQ-HOME-104) ----------------
test('REQ-HOME-104 the Home-visible summary of every role names no employer, institution or system', async () => {
  const { content, errors } = await buildContent({ contentDir: REAL });

  assert.deepEqual(errors, []);
  assert.ok(content.experience.length >= 3);
  for (const role of content.experience) {
    const visible = role.homeSummary ?? role.summary;
    assert.doesNotMatch(
      visible,
      /ReBIT|Reserve Bank|RBI\b|e-?Kuber|Lumu|IIT Bombay|NanoBios/i,
      `${role.id}: the Home summary names an employer or system`,
    );
  }
});

test('REQ-HOME-104 homeSummary is optional, kept when present, and must not be empty', async () => {
  const withHome = (value) =>
    withContent((d) =>
      editYaml(d, 'experience/2024-11-rebit.yaml', (y) => (y.homeSummary = value)),
    );
  const ok = withHome('A short summary for Home.');
  const good = await buildContent({ contentDir: ok.dir });
  ok.done();
  const empty = withHome('');
  const bad = await buildContent({ contentDir: empty.dir });
  empty.done();

  assert.deepEqual(good.errors, []);
  assert.equal(
    good.content.experience.find((r) => r.id === '2024-11-rebit').homeSummary,
    'A short summary for Home.',
  );
  assert.match(joined(bad.errors), /homeSummary/);
});
