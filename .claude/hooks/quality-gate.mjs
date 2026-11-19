// Stop: fast checks (target under ~15 s) for the parts of the repo that changed (ADR-0004).
// Full lint, tests and build run in /ship. Exit 2 sends the failures back to Claude.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { readInput, exists, ROOT } from "./lib.mjs";

const input = await readInput();
if (input?.stop_hook_active) process.exit(0); // already fixing a gate failure; avoid loops

const sh = (cmd, args, cwd = ROOT) =>
  spawnSync(cmd, args, {
    cwd,
    shell: process.platform === "win32",
    encoding: "utf8",
    timeout: 45_000,
  });

const status = sh("git", ["status", "--porcelain"]);
if (status.status !== 0) process.exit(0);
const changed = status.stdout
  .split("\n")
  .filter((l) => l && !l.startsWith(" D") && !l.startsWith("D "))
  .map((l) =>
    l
      .slice(3)
      .replace(/\\/g, "/")
      .replace(/^.* -> /, "")
      .replace(/^"|"$/g, ""),
  );

const failures = [];
const WEB = resolve(ROOT, "apps/web");
const webChanged = changed.filter((f) => f.startsWith("apps/web/"));

if (webChanged.length && exists("apps/web/node_modules")) {
  // Typecheck (about 11 s).
  const tc = sh("npm", ["run", "-s", "typecheck"], WEB);
  if (tc.status !== 0)
    failures.push(
      `web typecheck failed:\n${(tc.stdout + tc.stderr).slice(-3000)}`,
    );

  // Prettier on the changed files only (about 2 s). Directories (untracked folders) are skipped.
  const files = webChanged
    .map((f) => f.slice("apps/web/".length))
    .filter((f) => /\.(ts|html|scss|css|json|mjs|js|md|ya?ml)$/.test(f));
  if (files.length) {
    const pr = sh(
      "npx",
      ["prettier", "--check", "--ignore-unknown", ...files],
      WEB,
    );
    if (pr.status !== 0)
      failures.push(
        `prettier found unformatted files (run npm run format in apps/web):\n${(pr.stdout + pr.stderr).slice(-2000)}`,
      );
  }
}

// Content: validate when the content build exists (spec 002 V1-02).
if (
  changed.some((f) => f.startsWith("content/")) &&
  exists("apps/web/scripts/build-content.mjs")
) {
  const r = sh("node", ["scripts/build-content.mjs", "--check"], WEB);
  if (r.status !== 0)
    failures.push(
      `content validation failed:\n${(r.stdout + r.stderr).slice(-3000)}`,
    );
}

// Never let personal documents become tracked.
const tracked = sh("git", ["ls-files", "docs/private"]);
if (tracked.stdout.trim())
  failures.push(`docs/private files are tracked by git:\n${tracked.stdout}`);

if (failures.length) {
  process.stderr.write(
    `[quality-gate] Fix these before finishing:\n\n${failures.join("\n\n")}\n`,
  );
  process.exit(2);
}
process.exit(0);
