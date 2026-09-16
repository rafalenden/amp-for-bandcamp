import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  outputDir: '.playwright/results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 2 : undefined,
  retries: 0,
  reporter: 'list',
  projects: [
    {
      name: 'chromium',
      use: {
        channel: 'chromium',
      },
    },
  ],
});
