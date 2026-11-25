// Read-only status of portfolio, payflow and settlement-lab: no tests, no builds, no writes except `git fetch`.
// Usage: node progress.mjs [portfolio|payflow|lab|all] [--no-fetch] [--pace=6]
// Percentages are effort-weighted estimates. A task counts 100% only when it is ticked on the merged branch.
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const only = args.find((a) => !a.startsWith('--')) ?? 'all';
const pace = Number(args.find((a) => a.startsWith('--pace='))?.slice(7)) || 6; // session hours per project per day
const here = import.meta.dirname;

function run(cmd, argv, cwd) {
  try {
    const opts = { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 };
    return execFileSync(cmd, argv, opts).trimEnd();
  } catch {
    return null;
  }
}

const root = dirname(dirname(resolve(here, run('git', ['rev-parse', '--git-common-dir'], here))));

// Effort estimates in session hours. A task missing here counts 4.
const HOURS = {
  'PF-01': 3, 'PF-02': 6, 'PF-03': 6, 'PF-04': 5, 'PF-05': 6, 'PF-06': 7,
  'PF-07': 4, 'PF-08': 4, 'PF-09': 8, 'PF-10': 6, 'PF-11': 4, 'PF-12': 1,
  'RD-01': 4, 'RD-02': 3, 'RD-03': 5, 'RD-04': 4, 'RD-05': 5,
  'RD-06': 3, 'RD-07': 6, 'RD-08': 6, 'RD-09': 4, 'RD-10': 2,
  'LAB-01': 3, 'LAB-02': 6, 'LAB-03': 1, 'LAB-04': 4, 'LAB-05': 5, 'LAB-06': 3, 'LAB-07': 2,
  'V2-01': 4, 'V2-02': 4, 'V2-03': 2, 'V2-04': 3, 'V2-05': 4, 'V2-06': 4, 'V2-07': 8,
  'V3-01': 4, 'V3-02': 2, 'V3-03': 5, 'V3-04': 4, 'V3-05': 4, 'V3-06': 4, 'V3-07': 3,
};
for (let i = 1; i <= 9; i++) HOURS[`L-0${i}`] = 3;

const PROJECTS = {
  portfolio: {
    dir: 'portfolio',
    base: 'origin/develop',
    groups: [
      { name: 'v1.2.0 redesign (spec 005)', file: 'specs/005-redesign/spec.md', target: '2026-11-29', live: 'public site' },
      {
        name: 'v2.0.0 Lab page (spec 004)',
        file: 'specs/004-lab-page/spec.md',
        target: '2026-12-01',
        live: '/lab page',
        after: 'the Lab API and your approval of spec 004',
      },
    ],
    urls: ['https://siddheshfulawade.com/', 'https://www.siddheshfulawade.com/'],
  },
  payflow: {
    dir: 'payflow',
    base: 'origin/main',
    groups: [{ name: 'v1.0.0', file: 'SPEC.md', target: '2026-11-30', live: 'GitHub release, runs with Docker Compose' }],
    urls: [],
  },
  lab: {
    dir: 'settlement-lab',
    base: 'origin/main',
    groups: [
      { name: 'engine, database, API', file: 'SPEC.md', target: '2026-11-29', live: 'API', after: 'hardening and your deploy yes (V2-06)' },
    ],
    urls: ['https://api.siddheshfulawade.com/actuator/health'],
  },
};

const bar = (p) => '#'.repeat(Math.round(p / 5)).padEnd(20, '.');
const day = (d) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

function tasksOf(text) {
  const rows = [...(text ?? '').matchAll(/^\s*- \[([ x~])\] ([A-Z][A-Z0-9]*-\d+)\s+(.*)$/gm)];
  return rows.map(([, box, id, title]) => ({
    id,
    done: box !== ' ',
    h: HOURS[id] ?? 4,
    title: title.replace(/^\[[a-z]+\]\s*/i, '').replace(/[`*]/g, '').slice(0, 62).trim(),
  }));
}

// Credit for work that is not merged yet. Deliberately cautious.
function credit(id, prs, branches) {
  const key = new RegExp(`(^|[^a-z0-9])${id.toLowerCase()}([^0-9]|$)`);
  const pr = prs.find((p) => key.test(p.headRefName.toLowerCase()) || key.test(p.title.toLowerCase()));
  if (pr) {
    const states = (pr.statusCheckRollup ?? []).map((c) => c.conclusion || c.status || c.state);
    const green = states.length > 0 && states.every((s) => ['SUCCESS', 'SKIPPED', 'NEUTRAL'].includes(s));
    const red = states.some((s) => ['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ERROR'].includes(s));
    const checks = green ? 'green' : red ? 'RED' : 'running or none';
    const part = red ? 0.4 : !green ? 0.5 : pr.isDraft ? 0.8 : 0.9;
    return [part, `PR #${pr.number}${pr.isDraft ? ' draft' : ''}, checks ${checks}`];
  }
  const branch = branches.find((b) => key.test(b.toLowerCase()));
  return branch ? [0.25, `branch ${branch}, no PR`] : [0, ''];
}

function openBranches(p, dir) {
  const list = run('git', ['branch', '--format=%(refname:short)', '--no-merged', p.base], dir) ?? '';
  return list.split('\n').filter((b) => {
    if (!b || b.startsWith('(')) return false;
    const track = run('git', ['for-each-ref', '--format=%(upstream:track)', `refs/heads/${b}`], dir) ?? '';
    return !track.includes('gone'); // a deleted upstream means it was squash-merged
  });
}

// `before` is the work left in earlier groups: they run one after the other. Returns the hours left so far.
function printGroup(g, p, dir, prs, branches, before) {
  const tasks = tasksOf(run('git', ['show', `${p.base}:${g.file}`], dir));
  if (!tasks.length) {
    console.log(`  ${g.name}: no tasks found in ${g.file}`);
    return before;
  }
  let total = 0;
  let merged = 0;
  let likely = 0;
  const open = [];
  for (const t of tasks) {
    const [part, why] = t.done ? [1, ''] : credit(t.id, prs, branches);
    total += t.h;
    merged += t.done ? t.h : 0;
    likely += t.h * part;
    if (!t.done) open.push(`    ${t.id.padEnd(7)} ~${t.h} h  ${t.title}${why ? `  [${why}]` : ''}`);
  }
  const left = total - likely;
  const pct = Math.floor((likely / total) * 100);
  const eta = new Date(Date.now() + Math.ceil((before + left) / pace) * 864e5);
  const target = new Date(`${g.target}T23:59:59`);
  const done = tasks.filter((t) => t.done).length;
  const proven = Math.floor((merged / total) * 100);
  console.log(`  ${g.name}: [${bar(pct)}] ${pct}%  (merged only: ${proven}%)  ${done}/${tasks.length} tasks, about ${Math.ceil(left)} h left`);
  const wait = g.after ? ` · waits for ${g.after}` : '';
  if (left <= 0) console.log(`    all tasks merged; live means: ${g.live}`);
  else console.log(`    at ${pace} h a day: ${day(eta)} · target ${day(target)} · ${eta <= target ? 'on track' : 'LATE'} · live means: ${g.live}${wait}`);
  open.forEach((line) => console.log(line));
  return before + left;
}

function printLocalOnly(p, dir) {
  const list = run('git', ['worktree', 'list', '--porcelain'], dir) ?? '';
  for (const line of list.split('\n').filter((l) => l.startsWith('worktree '))) {
    const tree = line.slice(9).trim();
    const status = run('git', ['status', '--porcelain=v1', '-b'], tree);
    if (status === null) continue;
    const [head, ...files] = status.split('\n');
    const branch = head.replace(/^## /, '').split('...')[0];
    if (branch.startsWith('HEAD')) continue;
    const ahead = head.includes('...') && !head.includes('[gone]') && !head.includes('...origin/develop')
      ? Number(/ahead (\d+)/.exec(head)?.[1] ?? 0)
      : Number(run('git', ['rev-list', '--count', `${p.base}..HEAD`], tree) ?? 0);
    if (files.length || ahead) {
      console.log(`  ONLY ON THIS LAPTOP: ${branch}: ${files.length} uncommitted entries, ${ahead} unpushed commit(s)  (${tree})`);
    }
  }
}

async function printUrl(url) {
  let result = 'no answer';
  try {
    result = (await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10000) })).status;
  } catch {
    // reported as no answer
  }
  console.log(`  ${url} -> ${result}`);
}

async function report(name) {
  const p = PROJECTS[name];
  const dir = resolve(root, p.dir);
  if (!args.includes('--no-fetch') && run('git', ['fetch', '-q', '--prune', 'origin'], dir) === null) {
    console.log(`(${name}: fetch failed, figures may be old)`);
  }
  const fields = 'number,title,isDraft,headRefName,statusCheckRollup';
  const raw = run('gh', ['pr', 'list', '--state', 'open', '--json', fields], dir);
  const prs = raw === null ? [] : JSON.parse(raw);
  const last = run('git', ['log', '-1', '--format=%h, %ad', '--date=format:%d %b %H:%M', p.base], dir);
  console.log(`\n=== ${p.dir.toUpperCase()} (${p.base} ${last})`);
  if (raw === null) console.log('  GitHub not reachable: open PRs are not counted');
  const branches = openBranches(p, dir);
  let before = 0;
  for (const g of p.groups) before = printGroup(g, p, dir, prs, branches, before);
  if (prs.length) {
    console.log(`  Open PRs: ${prs.map((x) => `#${x.number}${x.isDraft ? ' (draft)' : ''} ${x.title.slice(0, 50)}`).join(' · ')}`);
  }
  printLocalOnly(p, dir);
  for (const url of p.urls) await printUrl(url);
}

const names = only === 'all' ? Object.keys(PROJECTS) : [only === 'settlement-lab' ? 'lab' : only];
if (names.some((n) => !Object.hasOwn(PROJECTS, n))) {
  console.error('Use: portfolio, payflow, lab or all');
  process.exit(1);
}
console.log(`Progress, ${new Date().toLocaleString('en-GB')}. Effort-weighted estimates; no tests were run.`);
for (const n of names) await report(n);
