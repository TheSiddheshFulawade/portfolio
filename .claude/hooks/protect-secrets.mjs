// PreToolUse (Read | Edit | Write | Grep | Glob): keep secrets out of Claude's context and edits.
import { readInput, block, allow, rel } from './lib.mjs';

const input = await readInput();
const ti = input?.tool_input ?? {};
const tool = input?.tool_name ?? '';
const candidates = [ti.file_path, ti.path, ti.notebook_path, ti.pattern && tool === 'Glob' ? ti.pattern : null]
  .filter(Boolean)
  .map(rel);

const SECRET = [
  /(^|\/)\.env$/,
  /(^|\/)\.env\.(?!example$)[\w.-]+$/,
  /(^|\/)secrets(\/|$)/,
  /\.(pem|key|p12|pfx|jks|keystore)$/i,
  /(^|\/)id_(rsa|ed25519)(\.pub)?$/,
];

for (const p of candidates) {
  if (SECRET.some((re) => re.test(p))) {
    block(`${p} looks like a secret. Claude must not read or change it. Ask the user to handle it.`);
  }
}

// Personal documents may be read (e.g. the resume) but never written to tracked files from here.
if (/^(Write|Edit|MultiEdit)$/.test(tool)) {
  for (const p of candidates) {
    if (/^docs\/private\//.test(p)) block(`${p} is in docs/private (personal documents). Do not modify it.`);
  }
}

allow();
