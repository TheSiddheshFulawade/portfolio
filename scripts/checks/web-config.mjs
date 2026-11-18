// apps/web policy checks (spec 001: REQ-WEB-001, REQ-WEB-006, REQ-REPO-001, REQ-REPO-003; later tasks extend this file).
// Zero dependencies. Each rule reads files under `root` and returns error strings.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const WEB = 'apps/web';
const PIN_SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies'];
const EXACT = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function readJson(root, rel, errors) {
  const file = join(root, rel);
  if (!existsSync(file)) {
    errors.push(`${rel} is missing`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    errors.push(`${rel} is not valid JSON: ${e.message}`);
    return null;
  }
}

function walkPins(prefix, value, errors) {
  if (typeof value === 'string') {
    // overrides may reference another dependency with "$name"; every other value must be an exact version
    if (!EXACT.test(value) && !value.startsWith('$')) errors.push(`${WEB}/package.json ${prefix} must be an exact version, not "${value}"`);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) walkPins(`${prefix}.${k}`, v, errors);
  }
}

/** REQ-WEB-006: every version in the manifest is an exact pin. */
export function pinErrors(pkg) {
  const errors = [];
  for (const section of [...PIN_SECTIONS, 'overrides']) {
    if (pkg[section]) walkPins(section, pkg[section], errors);
  }
  return errors;
}

/** REQ-WEB-001: zoneless, static output, prerendered server routes, no Express server. */
export function zonelessErrors(root, pkg, angular) {
  const errors = [];
  for (const section of PIN_SECTIONS) {
    for (const banned of ['zone.js', 'express']) {
      if (pkg?.[section]?.[banned] !== undefined) errors.push(`${banned} must not be in ${section} (ADR-0001)`);
    }
  }
  for (const [name, project] of Object.entries(angular?.projects ?? {})) {
    const options = project?.architect?.build?.options ?? {};
    if (options.outputMode !== 'static') errors.push(`angular.json ${name} build outputMode must be "static"`);
    if (options.ssr?.entry !== undefined) errors.push(`angular.json ${name} build must not set ssr.entry (no server)`);
    if (options.polyfills !== undefined) errors.push(`angular.json ${name} build must not set polyfills (no zone.js)`);
  }
  const routes = join(root, WEB, 'src/app/app.routes.server.ts');
  if (!existsSync(routes)) errors.push(`${WEB}/src/app/app.routes.server.ts is missing`);
  else {
    const text = readFileSync(routes, 'utf8');
    if (!/path:\s*'\*\*'\s*,\s*renderMode:\s*RenderMode\.Prerender/.test(text)) {
      errors.push("app.routes.server.ts must contain { path: '**', renderMode: RenderMode.Prerender }");
    }
  }
  if (existsSync(join(root, WEB, 'src/server.ts'))) errors.push(`${WEB}/src/server.ts must not exist (static output, no Express)`);
  return errors;
}

const parse = (v) => v.split('.').map(Number);
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** REQ-REPO-003: .nvmrc satisfies engines.node (supports ">=X.Y.Z <A.B.C" comparator sets). */
export function enginesErrors(nvmrc, engines) {
  if (!engines) return [`${WEB}/package.json engines.node is missing`];
  const version = parse(nvmrc.trim());
  for (const part of engines.split(/\s+/).filter(Boolean)) {
    const m = /^(>=|<)(\d+\.\d+\.\d+)$/.exec(part);
    if (!m) return [`${WEB}/package.json engines.node has unsupported comparator "${part}"`];
    const c = cmp(version, parse(m[2]));
    if ((m[1] === '>=' && c < 0) || (m[1] === '<' && c >= 0)) {
      return [`.nvmrc ${nvmrc.trim()} does not satisfy engines.node "${engines}"`];
    }
  }
  return [];
}

export function check(root) {
  const errors = [];
  const rootPkg = readJson(root, 'package.json', errors);
  if (rootPkg?.workspaces !== undefined) errors.push('root package.json must not define workspaces (REQ-REPO-001)');
  const pkg = readJson(root, `${WEB}/package.json`, errors);
  if (!existsSync(join(root, WEB, 'package-lock.json'))) errors.push(`${WEB}/package-lock.json is missing (commit the lockfile)`);
  const angular = readJson(root, `${WEB}/angular.json`, errors);
  if (!pkg) return errors;
  errors.push(...pinErrors(pkg));
  if (angular) errors.push(...zonelessErrors(root, pkg, angular));
  const nvmrcFile = join(root, '.nvmrc');
  if (existsSync(nvmrcFile)) errors.push(...enginesErrors(readFileSync(nvmrcFile, 'utf8'), pkg.engines?.node));
  return errors;
}
