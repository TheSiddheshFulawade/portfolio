// PostToolUse (Edit | Write): format the changed file if the formatter is installed. Never blocks.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { readInput, exists, rel, ROOT } from './lib.mjs';

const input = await readInput();
const file = rel(input?.tool_input?.file_path);
if (!file) process.exit(0);

const run = (cmd, args, cwd = ROOT) =>
  spawnSync(cmd, args, { cwd, shell: process.platform === 'win32', stdio: 'ignore', timeout: 60_000 });

const PRETTIER_EXT = /\.(ts|tsx|js|mjs|cjs|json|scss|css|html|md|ya?ml)$/i;
const prettierBin = 'apps/web/node_modules/.bin/prettier';

if (PRETTIER_EXT.test(file) && exists(prettierBin) && !file.startsWith('docs/private/')) {
  run(resolve(ROOT, prettierBin), ['--write', '--ignore-unknown', resolve(ROOT, file)]);
} else if (/\.java$/.test(file) && exists('apps/api/pom.xml')) {
  // Spotless (google-java-format) is configured in spec 001; apply to the single file.
  const mvnw = process.platform === 'win32' ? 'mvnw.cmd' : './mvnw';
  run(mvnw, ['-q', 'spotless:apply', `-DspotlessFiles=${resolve(ROOT, file).replace(/\\/g, '/')}`], resolve(ROOT, 'apps/api'));
}

process.exit(0);
