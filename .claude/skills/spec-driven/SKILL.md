---
name: spec-driven
description: The spec-driven development process for this repo - spec folder layout, EARS acceptance criteria, approval gates, task format and templates. Load whenever creating or working from a spec.
---
# Spec-driven development

Flow: `requirements.md` → user approves → `design.md` → user approves → `tasks.md` → one task per session.
Templates are in `templates/` next to this file. Specs live in `specs/NNN-kebab-name/`.

## Status line
Each spec file ends with `Status: DRAFT` or `Status: APPROVED (YYYY-MM-DD)`. Only the user approves.
Never design from an unapproved requirements.md, or create tasks from an unapproved design.md.

## EARS patterns
- Ubiquitous: THE <system> SHALL <response>.
- Event: WHEN <trigger>, THE <system> SHALL <response>.
- State: WHILE <state>, THE <system> SHALL <response>.
- Unwanted: IF <condition>, THEN THE <system> SHALL <response>.
- Optional: WHERE <feature is included>, THE <system> SHALL <response>.

IDs: `REQ-<AREA>-NNN` (AREA such as HOME, LAB, CONTENT, SEC). Every criterion must be testable.

## Planned specs
000 constitution · 001 monorepo & tooling · 002 design system · 003 content model & CMS ·
004 app shell · 005 home · 006 experience · 007 project write-up template · 008 projects ·
009 notes · 010 settlement-lab engine · 011 settlement-lab UI · 012 contact ·
013 engineering page · 014 security hardening · 015 observability · 016 deploy & release ·
017 resume PDF from content · 018 visitor analytics & public counter
