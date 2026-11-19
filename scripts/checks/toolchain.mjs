// REQ-REPO-003: the Node version is pinned exactly in .nvmrc (Node 24 LTS, at least 24.15.0 for Angular 22).
// T-05 adds the .nvmrc ↔ apps/web engines check; T-09 adds .sdkmanrc.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIN = [24, 15, 0];

export function nvmrcErrors(text) {
  const value = text.trim();
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!m) return [`.nvmrc must hold an exact version like 24.22.3, not "${value}"`];
  const v = m.slice(1).map(Number);
  if (v[0] !== 24) return [`.nvmrc must pin Node 24 LTS, not ${value}`];
  const cmp = v[1] - MIN[1] || v[2] - MIN[2];
  if (cmp < 0) return [`.nvmrc must be >= ${MIN.join('.')} (Angular 22 requirement), not ${value}`];
  return [];
}

export function check(root) {
  const file = join(root, '.nvmrc');
  if (!existsSync(file)) return ['.nvmrc is missing'];
  return nvmrcErrors(readFileSync(file, 'utf8'));
}
