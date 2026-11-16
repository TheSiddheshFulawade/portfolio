// PreToolUse (Bash | PowerShell): block destructive or policy-breaking shell commands.
import { readInput, block, allow } from './lib.mjs';

const input = await readInput();
const cmd = String(input?.tool_input?.command ?? '');
const c = cmd.replace(/\s+/g, ' ').trim();

// Build output folders that are safe to delete recursively.
const SAFE_DELETE = /^(\.\/)?(apps\/(web|api)\/)?(node_modules|dist|target|coverage|\.angular|playwright-report|test-results|\.lighthouseci)\/?$/;

const rules = [
  [/\bgit\s+push\b.*(\s--force(-with-lease)?\b|\s-f\b)/, 'force push is not allowed'],
  [/\bgit\s+push\b(?!.*--dry-run)[^;&|\n]*[\s:](main|master|develop)(?=\s|$|;|&|\|)/, 'direct push to main or develop is not allowed; push a work branch and open a pull request (/ship)'],
  [/\bgh\s+pr\s+merge\b[^;&|\n]*--admin\b/, 'bypassing branch protection with --admin is not allowed'],
  [/--no-verify\b/, 'skipping git hooks (--no-verify) is not allowed'],
  [/\bgit\s+(commit|merge|rebase)\b.*\s-c\s+commit\.gpgsign=false/, 'disabling commit signing is not allowed'],
  [/\b(curl|wget|iwr|Invoke-WebRequest)\b[^|]*\|\s*(ba|z)?sh\b/, 'piping a download into a shell is not allowed'],
  [/\b(iex|Invoke-Expression)\b.*\b(iwr|Invoke-WebRequest|DownloadString)\b/, 'executing downloaded scripts is not allowed'],
  [/(^|[\s;&|])(cat|type|Get-Content|gc|less|more|head|tail|grep|findstr|Select-String)\s+[^|;&]*\.env(?!\.example\b)(\.[\w-]+)?(?![\w.])/i, 'reading .env files is not allowed'],
  [/\bgit\s+add\b[^;&|\n]*docs[\\/]private/,'docs/private holds personal documents and must never be committed'],
  [/\bgit\s+add\s+(-f|--force)\b/, 'force-adding ignored files is not allowed'],
];

for (const [re, reason] of rules) {
  if (re.test(c)) block(`${reason}.\nCommand: ${cmd}`);
}

// rm -rf / Remove-Item -Recurse: only build output folders.
const rm = c.match(/\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f?[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*|-r\s+-f|-f\s+-r)\s+([^;&|]+)/);
if (rm) {
  const targets = rm[2].trim().split(/\s+/);
  const unsafe = targets.filter((t) => !SAFE_DELETE.test(t.replace(/\\/g, '/').replace(/^["']|["']$/g, '')));
  if (unsafe.length) block(`recursive delete outside build folders: ${unsafe.join(', ')}. Ask the user to delete it.`);
}
if (/\bRemove-Item\b.*-Recurse/i.test(c)) {
  const m = c.match(/Remove-Item\s+(-\w+\s+)*["']?([^"'\s]+)/i);
  const target = (m?.[2] ?? '').replace(/\\/g, '/');
  if (!SAFE_DELETE.test(target)) block(`recursive delete outside build folders: ${target || '(unknown)'}. Ask the user to delete it.`);
}

allow();
