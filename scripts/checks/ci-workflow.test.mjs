import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { check, workflowErrors } from "./ci-workflow.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1";

const good = `name: CI
on:
  pull_request:
    branches: [develop, main]
permissions:
  contents: read
jobs:
  verify:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@${SHA} # v7.0.1
      - run: npm run verify
      - run: npm run e2e
`;
const has = (errors, text) => errors.some((e) => e.includes(text));

test("REQ-CI-002 a pinned, read-only workflow that runs verify and e2e on PRs passes", () => {
  assert.deepEqual(workflowErrors(good), []);
});

test("REQ-CI-002 every action must be pinned by a full commit SHA", () => {
  for (const ref of ["v7", "v7.0.1", "main", "3d3c42e"]) {
    const errors = workflowErrors(good.replace(`@${SHA}`, `@${ref}`));
    assert.ok(has(errors, "pinned"), ref);
  }
});

test("REQ-CI-002 permissions must be read-only and set at the top level", () => {
  assert.ok(
    has(
      workflowErrors(good.replace("contents: read", "contents: write")),
      "permissions",
    ),
  );
  assert.ok(
    has(
      workflowErrors(good.replace("permissions:\n  contents: read\n", "")),
      "permissions",
    ),
  );
  assert.ok(
    has(
      workflowErrors(good.replace("contents: read", "write-all")),
      "permissions",
    ),
  );
});

test("REQ-CI-001 the workflow runs on pull requests to develop and main, and runs verify and e2e", () => {
  assert.ok(
    has(workflowErrors(good.replace("[develop, main]", "[develop]")), "main"),
  );
  assert.ok(
    has(
      workflowErrors(good.replace("npm run verify", "npm test")),
      "npm run verify",
    ),
  );
  assert.ok(
    has(workflowErrors(good.replace("npm run e2e", "echo")), "npm run e2e"),
  );
});

test("REQ-CI-002 pull_request_target is not allowed", () => {
  const errors = workflowErrors(
    good.replace("pull_request:", "pull_request_target:"),
  );
  assert.ok(has(errors, "pull_request_target"));
});

test("REQ-CI-001 the real repository has a valid CI workflow", () => {
  assert.deepEqual(check(repoRoot), []);
});
