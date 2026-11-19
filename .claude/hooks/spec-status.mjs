// SessionStart: print open spec tasks and the latest handoff. Stdout is added to Claude's context.
// Specs keep tasks in spec.md (ADR-0004) or tasks.md (older specs). `[x]` done, `[~]` closed
// (dropped or moved), `[ ]` open.
// Handoffs are named docs/sessions/YYYY-MM-DD-NN-topic.md; the latest is chosen by date, then by
// the sequence number NN. Modified times are not used: git checkout and clone reset them.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "./lib.mjs";

/** Sort key for a handoff file name; names without NN sort before NN=01 on the same day. */
export function handoffKey(name) {
  const m = /^(\d{4}-\d{2}-\d{2})(?:-(\d{2}))?-/.exec(name);
  if (!m) return null;
  return `${m[1]}-${m[2] ?? "00"}`;
}

/** The latest handoff file name, or undefined. Ignores files that do not start with a date. */
export function latestHandoff(names) {
  return names
    .filter((n) => n.endsWith(".md") && handoffKey(n))
    .sort(
      (a, b) =>
        handoffKey(a).localeCompare(handoffKey(b)) || a.localeCompare(b),
    )
    .at(-1);
}

/** Task counts from a spec or tasks file's checkbox lines. */
export function taskSummary(text) {
  const done = (text.match(/^\s*- \[x\]/gim) ?? []).length;
  const closed = (text.match(/^\s*- \[~\]/gm) ?? []).length;
  const open = text.match(/^\s*- \[ \].*$/gm) ?? [];
  const next = open[0]?.replace(/^\s*- \[ \]\s*/, "").slice(0, 80);
  return { done, closed, open: open.length, next };
}

function main() {
  const out = [];
  const specsDir = resolve(ROOT, "specs");
  if (existsSync(specsDir)) {
    const specs = readdirSync(specsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    const lines = [];
    for (const s of specs) {
      const file = ["spec.md", "tasks.md"]
        .map((f) => resolve(specsDir, s, f))
        .find(existsSync);
      if (!file) {
        lines.push(`- ${s}: no tasks yet`);
        continue;
      }
      const t = taskSummary(readFileSync(file, "utf8"));
      const total = t.done + t.closed + t.open;
      const state = t.open ? `${t.done}/${total} done` : "complete";
      const closed = t.closed ? `, ${t.closed} closed` : "";
      lines.push(
        `- ${s}: ${state}${closed}` + (t.next ? ` · next: ${t.next}` : ""),
      );
    }
    out.push(
      lines.length
        ? `Spec status:\n${lines.join("\n")}`
        : "Spec status: no specs yet (start with /spec).",
    );
  }

  const sessDir = resolve(ROOT, "docs/sessions");
  if (existsSync(sessDir)) {
    const last = latestHandoff(readdirSync(sessDir));
    if (last) {
      const text = readFileSync(resolve(sessDir, last), "utf8");
      out.push(
        `Latest handoff (docs/sessions/${last}):\n${text.slice(0, 1500)}`,
      );
    }
  }

  const brief = resolve(ROOT, "docs/brief.md");
  if (
    existsSync(brief) &&
    /Status:\s*DRAFT/i.test(readFileSync(brief, "utf8"))
  ) {
    out.push(
      "Note: docs/brief.md is still DRAFT. Ask the user to review and approve it before writing specs.",
    );
  }

  process.stdout.write(out.join("\n\n") + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
