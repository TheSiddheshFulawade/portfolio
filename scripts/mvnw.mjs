// Maven runner: runs the api's Maven wrapper with the same root script on cmd.exe and sh.
// Spec 001 design: "Maven runner" and "Maven runner argument allow-list" (REQ-REPO-002).
//
// On win32 Node can only start a .cmd file through a shell (CVE-2024-27980 fix), and cmd.exe
// expands %VAR% and ^ even inside quotes, so every argument must pass the allow-list before
// anything is spawned. The executable and the cwd are constants.
import { spawn as nodeSpawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const PLAIN = /^[A-Za-z0-9][A-Za-z0-9_.:=,+/@-]*$/;
const OPTION = /^-{1,2}[A-Za-z0-9][A-Za-z0-9_.:=,+/@-]*$/;

/** Returns the first argument that fails the allow-list, or null when all pass. */
export function validateArgs(args) {
  for (const arg of args) {
    if (typeof arg !== 'string' || !(PLAIN.test(arg) || OPTION.test(arg))) return arg;
  }
  return null;
}

/** What to spawn. Call only with arguments that passed validateArgs. */
export function buildSpawn(platform, args, root = ROOT) {
  const cwd = resolve(root, 'apps/api');
  if (platform === 'win32') {
    // One command string, no args array: avoids the Node 24 DEP0190 warning. The allow-list
    // admits no whitespace or metacharacters, so joining with spaces is exact. `.\` pins the
    // wrapper in cwd, so no PATH lookup happens.
    const command = ['.\\mvnw.cmd', ...args].join(' ');
    return { command, args: [], options: { cwd, shell: true } };
  }
  return { command: './mvnw', args: [...args], options: { cwd, shell: false } };
}

export async function main(
  argv,
  { platform = process.platform, spawn = nodeSpawn, root = ROOT, stderr = process.stderr } = {},
) {
  const rejected = validateArgs(argv);
  if (rejected !== null) {
    stderr.write(`mvnw.mjs: rejected argument ${JSON.stringify(rejected)}\n`);
    return 2;
  }
  const { command, args, options } = buildSpawn(platform, argv, root);
  return new Promise((done) => {
    let settled = false;
    const finish = (code) => {
      if (!settled) {
        settled = true;
        done(code);
      }
    };
    const child = spawn(command, args, { ...options, stdio: 'inherit' });
    child.on('error', (err) => {
      // A missing cwd surfaces as ENOENT on the shell or wrapper, which hides the real cause.
      const reason = existsSync(options.cwd) ? err.message : 'apps/api not found (the api project arrives with spec 001 T-09)';
      stderr.write(`mvnw.mjs: ${reason}\n`);
      finish(1);
    });
    child.on('close', (code) => finish(typeof code === 'number' ? code : 1));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
