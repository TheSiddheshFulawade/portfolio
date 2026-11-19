# v1 quality pass (spec 002 V1-12)

Run on 2026-11-21 (cloud session) against `npm run build` output, Lighthouse 13.6.0 (mobile, simulated
throttling) on headless Chromium, served with Brotli and long-cache headers the way Cloudflare Pages serves it.
Re-run on the Cloudflare preview before the release (V1-13).

## Lighthouse (mobile)

| Route                      | Performance                     | Accessibility | Best practices | SEO | LCP   | CLS | TBT          |
| -------------------------- | ------------------------------- | ------------- | -------------- | --- | ----- | --- | ------------ |
| `/`                        | 100 (median of 3: 98, 100, 100) | 100           | 100            | 100 | 1.0 s | 0   | 50 to 160 ms |
| `/projects/settlement-lab` | 100                             | 100           | 100            | 100 | 1.0 s | 0   | 40 ms        |
| `/experience`              | 100                             | n/a           | n/a            | n/a | 0.9 s | 0   | 60 ms        |
| `/about`                   | 94 (uncompressed)               | 100           | 100            | 100 | 1.1 s | 0   | 290 ms       |

Budgets: initial JS 87.3 KB gzipped (≤120), LCP about 1.0 s (≤1.8 s), CLS 0 (≤0.05). Without compression,
Home dropped to 88 and Settlement Lab's LCP to 3.7 s, so compression on the host matters.

## Mobile and accessibility

- Every route at 320, 375, 768 and 1280 px, dark and light: no horizontal scroll, one `h1`, no console errors,
  no serious or critical axe violations (axe-core 4.10). The Playwright smoke test repeats the 320 px and axe checks.
- Keyboard: skip link, mobile menu (Enter opens, Escape and navigation close it), focus moves to the new `h1`.
- Reduced motion: no running animations. Saved theme applies before first paint (no flash).

## Gaps

- None against the budgets. TBT on Home is mostly hydration of the main bundle, which includes all of
  `content.json`; splitting project HTML into per-route chunks is a v1.1 candidate.
