import { test } from "node:test";
import assert from "node:assert/strict";
import { handoffKey, latestHandoff, taskSummary } from "./spec-status.mjs";

test("latest handoff uses the sequence number within a day, not the topic name", () => {
  const names = [
    "2026-11-18-02-batch1-web-skeleton.md",
    "2026-11-18-01-spec001-review-fixes.md",
    "2026-11-16-01-day1-setup.md",
  ];

  assert.equal(latestHandoff(names), "2026-11-18-02-batch1-web-skeleton.md");
});

test("a later date wins over a higher sequence number", () => {
  assert.equal(
    latestHandoff(["2026-11-18-09-a.md", "2026-11-19-01-b.md"]),
    "2026-11-19-01-b.md",
  );
});

test("legacy names without a sequence sort before numbered ones on the same day", () => {
  assert.equal(handoffKey("2026-11-18-topic.md"), "2026-11-18-00");
  assert.equal(
    latestHandoff(["2026-11-18-01-a.md", "2026-11-18-zzz.md"]),
    "2026-11-18-01-a.md",
  );
});

test("files without a leading date and non-Markdown files are ignored", () => {
  assert.equal(
    latestHandoff(["README.md", "notes.txt", "2026-11-18-01-a.txt"]),
    undefined,
  );
});

test("task summary counts done, closed and open boxes and names the next open task", () => {
  const text = "- [x] T-01 a\n- [~] T-02 b\n- [ ] T-03 c\n- [ ] T-04 d\n";

  assert.deepEqual(taskSummary(text), {
    done: 1,
    closed: 1,
    open: 2,
    next: "T-03 c",
  });
});
