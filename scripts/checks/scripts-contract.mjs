// REQ-REPO-002: the root package.json is a dependency-free script contract.
// Spec 001 design: "Root script contract". install:renovate and check:renovate arrive with T-16.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const REQUIRED_SCRIPTS = [
  'install:web', 'lint:web', 'format:check:web', 'typecheck:web', 'test:web', 'build:web', 'audit:web',
  'lint:api', 'format:check:api', 'typecheck:api', 'test:api', 'build:api', 'audit:api',
  'format:web', 'format:api',
  'test:hooks', 'test:scripts', 'check:repo',
  'lint', 'format:check', 'typecheck', 'test', 'build', 'audit', 'verify',
];

const FORBIDDEN_FIELDS = [
  'dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'bundleDependencies', 'workspaces',
];

export function check(root) {
  const file = join(root, 'package.json');
  if (!existsSync(file)) return ['package.json is missing at the repo root'];
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    return [`package.json is not valid JSON: ${err.message}`];
  }
  const errors = [];
  if (pkg.private !== true) errors.push('package.json must set "private": true');
  for (const field of FORBIDDEN_FIELDS) {
    if (field in pkg) errors.push(`package.json must not have "${field}" (the root is scripts only)`);
  }
  if (existsSync(join(root, 'package-lock.json'))) {
    errors.push('package-lock.json must not exist at the repo root (each app has its own)');
  }
  const scripts = pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
  for (const name of REQUIRED_SCRIPTS) {
    if (typeof scripts[name] !== 'string' || !scripts[name].trim()) {
      errors.push(`package.json is missing the "${name}" script`);
    }
  }
  return errors;
}
