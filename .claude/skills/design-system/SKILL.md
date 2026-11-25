---
name: design-system
description: Visual language of the portfolio - colour tokens, typography, rail layout, shared classes and motion rules. Load before building or reviewing any UI in apps/web.
---

# Design system

A senior engineer's site: calm at rest, precise in motion, nothing decorative. Dark first, light theme equal.
One accent (teal). Amber means in development or held; red means failed. Code: `apps/web/src/styles/tokens.css`
(values) and `base.css` (shared classes, documented there by group). If this file and the code differ, fix both.

## Colour

| Token | Dark | Light | Use |
|---|---|---|---|
| --bg | #0a0e13 | #f4f6f5 | page |
| --panel | #10161d | #ffffff | simulations, footer |
| --raise | #16202a | #e9eeec | nested surface, code |
| --line | #1f2b36 | #d5dddb | rules between sections and rows |
| --line-2 | #2e3d4b | #b7c3c0 | table heads, stronger rules |
| --control | #5d6f80 | #7f8f8c | borders of buttons and chips (3:1 on bg and panel) |
| --text | #d9e1e8 | #26313a | body |
| --text-strong | #eef3f6 | #0d141a | headings, key words |
| --dim | #93a3b1 | #55636f | secondary text |
| --accent | #4fd1c5 | #0a6964 | links, primary, passing |
| --accent-ink | #06201d | #ffffff | text on a solid accent button |
| --amber | #f2b84b | #8e5406 | in development, held, warning |
| --red | #f07a6e | #b3261e | failed |

Text 4.5:1 on bg, panel and raise (`tokens.test.mjs`). Shapes that carry meaning 3:1. Never a literal colour in a
component. Never colour alone: add a word, shape or icon.

## Type

- IBM Plex Sans Condensed 600 for headings; IBM Plex Sans 400/500 for text; IBM Plex Mono for data and code.
  Self-hosted woff2, latin subset. Add no weights.
- Body 1.0625rem / 1.65. Lead 1.14rem. Notes, facts and rail text 0.95rem. Numbers that change: tabular-nums.
- Heading sizes are tokens, one per role: `--size-hero`, `--size-page`, `--size-contact`, `--size-project`,
  `--size-section`, `--size-role`, `--size-row`, `--size-rail`. Sentence case. No small uppercase labels above headings.

## Layout

- 1200px of content; gutter 24px, 16px below 40rem (`.container` on main, `.wrap` inside a `.full` page).
- `.page-head`: h1 and `.lead`. Then sections, each separated by a thin rule and generous space (`--band`).
- Section = `<section class="band">` with `<header class="rail">` (h2, one short line) and `<div class="detail">`.
  Two columns from 60rem with the rail sticky; one column below. `.solo` = no rail, large h2, full-width content.
- Lists of work or roles: `<ul class="rows">` with a `.row` per item: `h3`, `p.sub`, text, `.side`. Ruled, not boxed.
- Panels (border, `--panel`, 10px radius) only for simulations and figures. No card grids for text.
- Spacing scale 4 8 12 16 24 32 48 64 96. Radius 6 (controls), 10 (panels). Prose 72ch at most.
- Check 320, 375, 768, 1024, 1440. No sideways page scroll.

## Controls

- `.btn` outlined, `.btn.solid` for the one main action on a page; group in `.acts`.
- `.more` = text link with an arrow. Arrow markup: `<svg class="arrow" viewBox="0 0 16 16" aria-hidden="true">
  <path d="M3 8h10M9 4l4 4-4 4" /></svg>`. On hover it moves 4px; nothing else moves.
- `.chips` > `.chip` = toggle buttons for a scenario or mode; `aria-pressed` marks the choice with a bar and a tint.
- `.status` (`.dev` for in development) = dot and words. `.facts` = plain inline facts. `.note-text` = caption.
- Focus: 2px accent outline, 3px offset. Targets at least 24px, main controls 44px.

## Motion (REQ-MOT-101 to 103)

- Motion explains a mechanism, shows a state change or guides the eye once. Otherwise leave it out.
- Nothing moves by itself for more than 5 seconds. Longer motion starts on a click and ends. Scroll-linked motion
  moves only with the scroll. No site-wide motion button.
- Animate only `transform` and `opacity` (canvas excepted). Colour changes are instant.
- Content is complete at rest, without JavaScript and with reduced motion. `prefers-reduced-motion: reduce` shows
  the final state at once, with the same text and numbers.
- Loops stop when off screen, hidden or settled. Nothing loops forever in CSS.
- Route changes fade the page (out 160ms, in 240ms) with view transitions; the header stays put. Skipped for reduced
  motion and for same-page links (`core/motion/route-transition.ts`). Focus still moves to the h1.
- Hover and enter 240ms or less, `--ease`. No smooth scrolling (it would animate the router's scroll reset).
- Platform first: CSS, Web Animations, View Transitions, canvas. No animation library without an ADR.

## Simulations

Draw only what the model says: no invented step, delay or number. Label it a simplified model. Start on a click, end
by itself, log steps as text, work by keyboard. Read colours from tokens and again on theme change.

## CSS rules

Strict CSP: no `style` attributes in templates. Set dynamic values through CSSOM or SVG attributes. Each component
stylesheet adds a CSP hash: use the shared classes, and keep to the spec's limit on new stylesheets.

## Don't

Gradients, glass, glow, parallax, background patterns, emoji, skill bars, count-up numbers, pulled buttons, stock
pictures, icon rows, a second accent, boxes inside boxes.
