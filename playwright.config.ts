import { defineConfig } from '@playwright/test';

// Every browser runs on CI; locally the suite stays on Chromium unless asked,
// e.g. `TEST_BROWSERS=firefox,webkit npm test`.
const browsers = (
  process.env.TEST_BROWSERS ??
  (process.env.CI ? 'chromium,firefox,webkit' : 'chromium')
).split(',');

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/global-setup.ts',
  outputDir: '.playwright/results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 2 : undefined,
  retries: 0,
  reporter: 'list',
  // How each browser gets the extension is in tests/browsers.
  projects: (['chromium', 'firefox', 'webkit'] as const)
    .filter((browserName) => browsers.includes(browserName))
    .map((browserName) => ({
      name: browserName,
      use: { browserName },
      // Audio stalls in one WebKit while another starts up beside it.
      ...(browserName === 'webkit' ? { workers: 1 } : {}),
    })),
});
