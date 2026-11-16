// SessionStart: print open spec tasks and the latest handoff. Stdout is added to Claude's context.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './lib.mjs';

const out = [];
const specsDir = resolve(ROOT, 'specs');

if (existsSync(specsDir)) {
  const specs = readdirSync(specsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const lines = [];
  for (const s of specs) {
    const dir = resolve(specsDir, s);
    const has = (f) => existsSync(resolve(dir, f));
    let state = has('tasks.md') ? 'tasks' : has('design.md') ? 'design' : has('requirements.md') ? 'requirements' : 'empty';
    let detail = '';
    if (has('tasks.md')) {
      const t = readFileSync(resolve(dir, 'tasks.md'), 'utf8');
      const done = (t.match(/^\s*- \[x\]/gim) ?? []).length;
      const open = t.match(/^\s*- \[ \].*$/gm) ?? [];
      detail = ` ${done}/${done + open.length} done` + (open[0] ? ` · next: ${open[0].replace(/^\s*- \[ \]\s*/, '').slice(0, 80)}` : '');
      if (!open.length) state = 'complete';
    }
    lines.push(`- ${s}: ${state}${detail}`);
  }
  out.push(lines.length ? `Spec status:\n${lines.join('\n')}` : 'Spec status: no feature specs yet (start with /spec-new).');
}

const sessDir = resolve(ROOT, 'docs/sessions');
if (existsSync(sessDir)) {
  const notes = readdirSync(sessDir).filter((f) => f.endsWith('.md')).sort();
  const last = notes.at(-1);
  if (last) {
    const text = readFileSync(resolve(sessDir, last), 'utf8');
    out.push(`Latest handoff (docs/sessions/${last}):\n${text.slice(0, 1500)}`);
  }
}

const brief = resolve(ROOT, 'docs/brief.md');
if (existsSync(brief) && /Status:\s*DRAFT/i.test(readFileSync(brief, 'utf8'))) {
  out.push('Note: docs/brief.md is still DRAFT. Ask the user to review and approve it before writing specs.');
}

process.stdout.write(out.join('\n\n') + '\n');
