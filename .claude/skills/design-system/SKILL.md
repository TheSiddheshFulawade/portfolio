---
name: design-system
description: Visual language of the portfolio - colour tokens, typography, spacing, motion rules and component inventory. Load before building or reviewing any UI in apps/web.
---
# Design system

Concept: an observability console for a payment engine, applied to a career.
Dark-first, light theme supported. One accent (settlement teal) plus amber for in-flight/warning.
Spec 002 task V1-03 turns this into code (`apps/web/src/styles/tokens.css`). Until then these values are the source.

## Colour tokens
| Token | Dark | Light | Use |
|---|---|---|---|
| --bg | #0A0E13 | #F4F6F5 | page |
| --panel | #10161D | #FFFFFF | cards, panels |
| --raise | #16202A | #EEF2F1 | hover, nested |
| --line | #1F2B36 | #DCE2E0 | borders, grid |
| --text | #D9E1E8 | #14191D | body |
| --text-strong | #EEF3F6 | #0B0F12 | headings |
| --dim | #7E8C99 | #5A6670 | secondary text |
| --accent | #4FD1C5 | #0A6964 | links, primary, healthy |
| --amber | #F2B84B | #8E5406 | in-flight, warning |
| --red | #F07A6E | #B3261E | error, failed |

Contrast: body text ≥ 4.5:1, large text and UI ≥ 3:1 in both themes. Never use a literal colour in a component.

## Typography
- Display: IBM Plex Sans Condensed 600 (headings only)
- Body: IBM Plex Sans 400/500
- Data: IBM Plex Mono 400/500, `font-variant-numeric: tabular-nums` for every number
- Scale (rem): 0.75 · 0.875 · 1 · 1.125 · 1.375 · 1.75 · 2.25 · 3 · 3.75
- Eyebrows: mono, 0.72rem, uppercase, letter-spacing .12em, accent colour
- Self-host fonts (woff2, latin subset), `font-display: swap`, preload the two above-the-fold faces.

## Space, radius, layout
- Spacing scale (px): 4 8 12 16 24 32 48 64 96. Use `gap`, not margins between siblings.
- Radius: 6 (controls), 10 (cards), 999 (pills). Do not round everything.
- Prose width 72ch; layout max 1200px; side gutter ≥ 16px.

## Motion
- Purposeful only: message flow (hero), live data (Lab), view transitions between list and detail,
  8px rise on section entry, one-time count-up of hero metrics, magnetic primary buttons,
  cursor-follow glow on cards, a slowly drifting dot grid (canvas, paused off screen).
- Durations: 120ms hover, 240ms enter, 400ms view transition. Easing: cubic-bezier(.2,.8,.2,1).
- Only transform and opacity. Content is visible at rest; never left at opacity 0 waiting for an observer.
- `prefers-reduced-motion: reduce` → no looping animation, instant transitions, static flow line.
- Platform first: CSS, Web Animations API, View Transitions API. No animation library without an ADR.

## Signature elements
- Status pill (dot + mono label): healthy / in-flight / failed
- Metric row: mono number + small label + sparkline
- Message-flow strip: nodes joined by wires with travelling packets
- Decision card (ADR style): label, decision, trade-off
- Footer visitor counter: `visitors.total 4,218 · today 37`

## Don't
Decorative gradients, glassmorphism, emoji, skill-percentage bars, stock illustrations,
centred-everything layouts, a second accent colour, parallax.
