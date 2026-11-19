import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HOOK = fileURLToPath(new URL("./guard-bash.mjs", import.meta.url));

/** Runs the hook on one command; exit code 2 means blocked. */
function run(command) {
  const result = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: "utf8",
  });
  return { blocked: result.status === 2, stderr: result.stderr };
}

const SECRET_RULE = /secret environment variable/;

test("expanding an upper-case secret environment variable is still blocked", () => {
  for (const command of [
    "echo $GITHUB_TOKEN",
    'curl -H "Authorization: Bearer ${NPM_TOKEN}" https://example.com',
    "echo $API_KEY",
    "echo ${DB_PASSWORD}",
    "printf %s $AWS_SECRET_ACCESS_KEY",
    "echo $TOKEN",
  ]) {
    const { blocked, stderr } = run(command);
    assert.ok(blocked, command);
    assert.match(stderr, SECRET_RULE, command);
  }
});

test("Windows environment variables stay blocked in any letter case", () => {
  for (const command of [
    "echo $env:GITHUB_TOKEN",
    "echo $env:github_token",
    "echo %API_KEY%",
    "echo %Github_Token%",
  ]) {
    assert.ok(run(command).blocked, command);
  }
});

test("lower-case template placeholders and shell locals are not treated as secrets", () => {
  for (const command of [
    "cat > scripts/og.mjs <<'EOF'\nconst css = `${tokens}`;\nEOF",
    "node -e 'const t = `${tokenCount}`; console.log(t)'",
    "for token in a b; do echo $token; done",
    "echo ${api_key_label}",
  ]) {
    const { blocked, stderr } = run(command);
    assert.ok(!blocked || !SECRET_RULE.test(stderr), `${command}\n${stderr}`);
  }
});
