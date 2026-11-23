import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HOOK = fileURLToPath(new URL("./protect-secrets.mjs", import.meta.url));

/** Runs the hook on one file-tool call; exit code 2 means blocked. */
function run(tool_name, file_path) {
  const result = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name, tool_input: { file_path } }),
    encoding: "utf8",
  });
  return result.status === 2;
}

test("secret files are blocked for reads and edits", () => {
  for (const path of [
    ".env",
    "apps/web/.env.production",
    "secrets/salt.txt",
    "certs/site.pem",
    "keys/site.key",
    "apps/web/.dev.vars",
    "apps/web/.dev.vars.preview",
    "apps/web/.wrangler/state/v3/d1/db.sqlite",
    ".git-credentials",
  ]) {
    assert.ok(run("Read", path), `Read ${path}`);
    assert.ok(run("Edit", path), `Edit ${path}`);
  }
});

test("ordinary project files and .env.example are allowed", () => {
  for (const path of [
    ".env.example",
    "apps/web/wrangler.toml",
    "apps/web/server/visits/handler.ts",
    "docs/dev-vars.md",
    "content/profile.yaml",
  ]) {
    assert.ok(!run("Read", path), `Read ${path}`);
    assert.ok(!run("Edit", path), `Edit ${path}`);
  }
});

test("docs/private may be read but never written", () => {
  assert.ok(!run("Read", "docs/private/notes.md"));
  assert.ok(run("Write", "docs/private/notes.md"));
  assert.ok(run("Edit", "docs/private/notes.md"));
});

test("system folders are never written", () => {
  if (process.platform === "win32") {
    assert.ok(run("Write", "C:/Windows/System32/drivers/etc/hosts"));
  } else {
    assert.ok(run("Write", "/etc/hosts"));
  }
});
