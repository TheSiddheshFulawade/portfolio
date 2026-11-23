// Spec 002 V1-11: renders public/og.png (1200 x 630), the Open Graph image for link previews, from content/
// (profile name and headline, site domain) with the design tokens and self-hosted fonts. Run by hand after the
// name or headline changes: `npm run og-image` (needs Playwright's Chromium). Not part of the build.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { buildContent } from './build-content.mjs';

const WEB = resolve(import.meta.dirname, '..');
const font = (pkg, file) =>
  readFileSync(join(WEB, 'node_modules/@fontsource', pkg, 'files', file)).toString('base64');
const designCss = readFileSync(join(WEB, 'src/styles/tokens.css'), 'utf8');
const escape = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const { content, errors } = await buildContent();
if (errors.length) throw new Error(`content/ is invalid:\n${errors.join('\n')}`);
const { profile, site } = content;

const fontFace = (family, weight, pkg, file) =>
  `@font-face { font-family: '${family}'; font-weight: ${weight}; ` +
  `src: url(data:font/woff2;base64,${font(pkg, file)}) format('woff2'); }`;

const html = `<!doctype html><html data-theme="dark"><head><style>
${designCss}
${fontFace('IBM Plex Sans Condensed', 600, 'ibm-plex-sans-condensed', 'ibm-plex-sans-condensed-latin-600-normal.woff2')}
${fontFace('IBM Plex Sans', 400, 'ibm-plex-sans', 'ibm-plex-sans-latin-400-normal.woff2')}
${fontFace('IBM Plex Mono', 400, 'ibm-plex-mono', 'ibm-plex-mono-latin-400-normal.woff2')}
html, body { margin: 0; width: 1200px; height: 630px; }
body { box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; gap: 28px;
  padding: 0 96px; background: var(--bg); color: var(--text);
  background-image: radial-gradient(var(--line) 1.5px, transparent 1.5px); background-size: 32px 32px; }
.eyebrow { display: flex; align-items: center; gap: 14px; color: var(--accent); font: 400 24px var(--font-mono);
  letter-spacing: .12em; text-transform: uppercase; }
.dot { width: 14px; height: 14px; border-radius: 999px; background: var(--accent); }
h1 { margin: 0; color: var(--text-strong); font: 600 112px/1 var(--font-display); }
p { margin: 0; max-width: 960px; font: 400 40px/1.3 var(--font-body); }
.rule { width: 160px; height: 4px; background: var(--accent); }
</style></head><body>
<div class="eyebrow"><span class="dot"></span>${escape(new URL(site.url).host)}</div>
<h1>${escape(profile.name)}</h1>
<div class="rule"></div>
<p>${escape(profile.headline)}</p>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
const out = join(WEB, 'public', 'og.png');
await page.screenshot({ path: out });
await browser.close();
console.log(`og-image: wrote ${out}`);
