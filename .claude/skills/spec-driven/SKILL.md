---
name: spec-driven
description: The spec-driven development process for this repo - one spec.md per release, EARS acceptance criteria, the single approval gate, task format and template. Load whenever creating or working from a spec.
---

# Spec-driven development (ADR-0004)

Flow: `/spec` writes `specs/NNN-release/spec.md` → the user approves once → tasks run one by one, each on
`feature/<spec>-<task>-<slug>` and merged by git-ops on green CI (ADR-0005). Template: `templates/spec.md` next to this file.
Older specs (001) used requirements.md, design.md and tasks.md; leave them as they are.

## Status line

Each spec ends with `Status: DRAFT` or `Status: APPROVED (YYYY-MM-DD)`. Only the user approves.
Never implement tasks from a DRAFT spec.

## Task checkboxes

`- [ ]` open · `- [x]` done · `- [~]` closed without doing it (dropped, moved or replaced; say why).
Tasks are feature-sized (a page, a component, an engine module) with observable acceptance checks.

## EARS patterns

- Ubiquitous: THE <system> SHALL <response>.
- Event: WHEN <trigger>, THE <system> SHALL <response>.
- State: WHILE <state>, THE <system> SHALL <response>.
- Unwanted: IF <condition>, THEN THE <system> SHALL <response>.
- Optional: WHERE <feature is included>, THE <system> SHALL <response>.

IDs: `REQ-<AREA>-NNN` (AREA such as PAGE, CONTENT, UI, SEO, DEP). Every criterion must be checkable.

## Release specs

000 constitution · 001 monorepo & tooling (done, scope cut) · 002 v1 site (22 Nov) ·
003 v1.1 counter, analytics, notes, headers, CI (~29 Nov) · 004 v2 Lab dashboard and contact form (~13 Dec) ·
005 v2.1 engineering page, generated resume, Lighthouse CI (~20 Dec).
Settlement Lab engine: `docs/settlement-lab-spec.md`, built in the `settlement-lab` repo.
