// apps/web policy checks (spec 001: REQ-WEB-001, REQ-WEB-005, REQ-WEB-006, REQ-REPO-001, REQ-REPO-003; later tasks extend this file).
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

const LINT_SCRIPT = 'ng lint && prettier --check .';

/** REQ-WEB-005: lint = ng lint then prettier --check; format scripts exist; Prettier uses LF and ignores build output. */
export function lintErrors(root, pkg) {
  const errors = [];
  const scripts = pkg.scripts ?? {};
  if (scripts.lint !== LINT_SCRIPT) errors.push(`${WEB}/package.json script "lint" must be "${LINT_SCRIPT}"`);
  if (!scripts.format) errors.push(`${WEB}/package.json script "format" is missing`);
  if (!scripts['format:check']) errors.push(`${WEB}/package.json script "format:check" is missing`);

  const rc = join(root, WEB, '.prettierrc.json');
  if (!existsSync(rc)) errors.push(`${WEB}/.prettierrc.json is missing`);
  else {
    try {
      if (JSON.parse(readFileSync(rc, 'utf8')).endOfLine !== 'lf') errors.push(`${WEB}/.prettierrc.json must set endOfLine "lf"`);
    } catch (e) {
      errors.push(`${WEB}/.prettierrc.json is not valid JSON: ${e.message}`);
    }
  }
  const ignore = join(root, WEB, '.prettierignore');
  const ignored = existsSync(ignore)
    ? readFileSync(ignore, 'utf8')
        .split(/\r?\n/)
        .map((l) => l.trim().replace(/^\/|\/$/g, ''))
    : null;
  if (!ignored) errors.push(`${WEB}/.prettierignore is missing`);
  else for (const dir of ['dist', 'coverage', '.angular']) if (!ignored.includes(dir)) errors.push(`${WEB}/.prettierignore must ignore ${dir}`);

  const eslint = join(root, WEB, 'eslint.config.js');
  if (!existsSync(eslint)) errors.push(`${WEB}/eslint.config.js is missing`);
  else {
    const text = readFileSync(eslint, 'utf8');
    for (const needle of ['tsRecommended', 'templateRecommended', 'templateAccessibility', 'prefer-on-push-component-change-detection']) {
      if (!text.includes(needle)) errors.push(`eslint.config.js must enable ${needle}`);
    }
    for (const rule of ['component-selector', 'directive-selector']) {
      if (!new RegExp(`@angular-eslint/${rule}'[^\\]]*prefix:\\s*'sf'`).test(text)) errors.push(`eslint.config.js ${rule} must use prefix 'sf'`);
    }
  }
  return errors;
}

const REQUIRED_SCRIPTS = {
  dev: (v) => v === 'ng serve',
  build: (v) => v === 'ng build',
  test: (v) => v === 'ng test --no-watch --coverage',
  typecheck: (v) => /tsc --noEmit -p tsconfig\.app\.json/.test(v) && /tsc --noEmit -p tsconfig\.spec\.json/.test(v),
  e2e: (v) => v === 'node scripts/e2e-stub.mjs',
};

/** REQ-WEB-003: the script set the root contract calls. */
export function scriptErrors(pkg) {
  const errors = [];
  for (const [name, ok] of Object.entries(REQUIRED_SCRIPTS)) {
    const value = pkg.scripts?.[name];
    if (value === undefined) errors.push(WEB + '/package.json script "' + name + '" is missing');
    else if (!ok(value)) errors.push(WEB + '/package.json script "' + name + '" has an unexpected command: ' + value);
  }
  return errors;
}

/** REQ-WEB-004: unit-test target uses the Vitest runner with an 80 % line threshold and text-summary + lcov reporters. */
export function coverageErrors(angular) {
  const test = angular?.projects?.web?.architect?.test;
  if (!test) return ['angular.json has no test target for project "web"'];
  const errors = [];
  const o = test.options ?? {};
  if (test.builder !== '@angular/build:unit-test') errors.push('angular.json test target must use @angular/build:unit-test');
  if (o.runner !== 'vitest') errors.push('angular.json test target runner must be "vitest"');
  const lines = o.coverageThresholds?.lines;
  if (typeof lines !== 'number' || lines < 80) errors.push('angular.json test target coverageThresholds.lines must be at least 80');
  for (const reporter of ['text-summary', 'lcov']) {
    if (!(o.coverageReporters ?? []).includes(reporter)) errors.push('angular.json test target coverageReporters must include ' + reporter);
  }
  if (!(o.coverageInclude ?? []).includes('src/app/**/*.ts')) errors.push('angular.json test target coverageInclude must include src/app/**/*.ts (untested files must count)');
  return errors;
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
  errors.push(...lintErrors(root, pkg), ...scriptErrors(pkg), ...coverageErrors(angular));
  const nvmrcFile = join(root, '.nvmrc');
  if (existsSync(nvmrcFile)) errors.push(...enginesErrors(readFileSync(nvmrcFile, 'utf8'), pkg.engines?.node));
  return errors;
}
