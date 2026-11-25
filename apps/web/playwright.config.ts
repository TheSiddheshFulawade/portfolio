import { defineConfig, devices } from '@playwright/test';

// Smoke test against the built static output (spec 002 V1-09). Chromium only (ADR-0004).
// Run `npm run build` first; `npm run e2e` serves dist/web/browser like Cloudflare Pages.
const port = 4310;

export default defineConfig({
  testDir: 'e2e',
  // Inside the app folder (relative to this file) and git-ignored, so no run leaves files elsewhere.
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  reporter: 'list',
  use: { baseURL: `http://localhost:${port}`, trace: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `node e2e/serve.mjs ${port}`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: false,
  },
});
