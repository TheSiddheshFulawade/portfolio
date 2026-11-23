// Spec 003 V11-01: the CI workflow (.github/workflows/ci.yml) runs the full gate on pull requests to develop
// and main (REQ-CI-001), pins every action by commit SHA and grants read-only permissions (REQ-CI-002).
// Text checks only: the repo root has no dependencies, so no YAML parser here.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const WORKFLOW = ".github/workflows/ci.yml";

export function workflowErrors(text) {
  const errors = [];
  const uses = [...text.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((m) => m[1]);
  for (const ref of uses) {
    if (!/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/.test(ref)) {
      errors.push(
        `${WORKFLOW}: action "${ref}" must be pinned by a full 40-character commit SHA`,
      );
    }
  }
  if (/\bpull_request_target\b/.test(text)) {
    errors.push(
      `${WORKFLOW}: pull_request_target is not allowed (it runs untrusted code with secrets)`,
    );
  }
  const prBranches =
    /^\s{2}pull_request:\s*\n\s{4}branches:\s*\[([^\]]*)\]/m.exec(text)?.[1] ??
    "";
  for (const branch of ["develop", "main"]) {
    if (
      !prBranches
        .split(",")
        .map((b) => b.trim())
        .includes(branch)
    ) {
      errors.push(`${WORKFLOW}: must run on pull requests to ${branch}`);
    }
  }
  const permissions = /^permissions:\s*\n((?:\s{2}.*\n?)*)/m.exec(text);
  if (!permissions || !/^\s{2}contents:\s*read\s*$/m.test(permissions[1])) {
    errors.push(`${WORKFLOW}: top-level permissions must be "contents: read"`);
  }
  if (/:\s*write\b|write-all/.test(text)) {
    errors.push(`${WORKFLOW}: permissions must be read-only (no write scopes)`);
  }
  for (const command of ["npm run verify", "npm run e2e"]) {
    if (!text.includes(command))
      errors.push(`${WORKFLOW}: must run "${command}"`);
  }
  return errors;
}

export function check(root) {
  const file = join(root, WORKFLOW);
  if (!existsSync(file)) return [`${WORKFLOW} is missing`];
  return workflowErrors(readFileSync(file, "utf8"));
}
