// REQ-REPO-004: LF everywhere except Windows scripts, binaries marked binary, wrapper scripts executable.
// The index rules work on parsed `git ls-files -s --eol` lines, so they are pure and testable.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REQUIRED_RULES = [
  '* text=auto eol=lf',
  '*.cmd text eol=crlf',
  '*.bat text eol=crlf',
  'mvnw text eol=lf',
  '*.sh text eol=lf',
];
const BINARY = ['*.pdf', '*.png', '*.jpg', '*.jpeg', '*.gif', '*.webp', '*.avif', '*.ico', '*.jar', '*.ttf', '*.woff', '*.woff2'];
const CRLF_ALLOWED = new Set(['*.cmd', '*.bat']);

const norm = (l) => l.trim().replace(/\s+/g, ' ');

export function attributesErrors(text) {
  const lines = text.split(/\r?\n/).map(norm).filter((l) => l && !l.startsWith('#'));
  const set = new Set(lines);
  const errors = [];
  for (const rule of REQUIRED_RULES) {
    if (!set.has(rule)) errors.push(`.gitattributes must contain "${rule}"`);
  }
  for (const pattern of BINARY) {
    if (!set.has(`${pattern} binary`)) errors.push(`.gitattributes must mark "${pattern}" as binary`);
  }
  for (const l of lines) {
    const [pattern, ...attrs] = l.split(' ');
    if (attrs.includes('eol=crlf') && !CRLF_ALLOWED.has(pattern)) {
      errors.push(`.gitattributes allows CRLF only for *.cmd and *.bat, not "${pattern}"`);
    }
  }
  return errors;
}

/** Parses `git ls-files -s --eol` output into { mode, index, path }. */
export function parseLsFiles(text) {
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      const [stage, eolInfo, ...rest] = l.split('\t');
      const mode = stage.split(' ')[0];
      const index = (eolInfo.match(/i\/(\S*)/) ?? [])[1] ?? '';
      return { mode, index, path: rest.join('\t') };
    });
}

export function indexErrors(entries) {
  const errors = [];
  for (const { mode, index, path } of entries) {
    const name = path.split('/').pop();
    const crlfOk = /\.(cmd|bat)$/i.test(name);
    if ((index === 'crlf' || index === 'mixed') && !crlfOk) {
      errors.push(`${path} has ${index} line endings in the index (expected lf)`);
    }
    if ((name === 'mvnw' || name.endsWith('.sh')) && mode !== '100755') {
      errors.push(`${path} must be tracked as 100755 (is ${mode}); run git update-index --chmod=+x ${path}`);
    }
  }
  return errors;
}

export function check(root) {
  const attrFile = join(root, '.gitattributes');
  if (!existsSync(attrFile)) return ['.gitattributes is missing'];
  const errors = attributesErrors(readFileSync(attrFile, 'utf8'));
  if (existsSync(join(root, '.git'))) {
    let out;
    try {
      out = execFileSync('git', ['ls-files', '-s', '--eol'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    } catch (err) {
      return [...errors, `git ls-files failed: ${err.message}`];
    }
    errors.push(...indexErrors(parseLsFiles(out)));
  }
  return errors;
}
