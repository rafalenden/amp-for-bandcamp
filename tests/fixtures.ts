import { test as base, chromium, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

export const test = base.extend<{ extensionId: string }>({
  context: async ({}, use) => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const pathToExtension =
      process.env.EXTENSION_PATH ??
      path.join(__dirname, '..', '.output', 'chrome-mv3');
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });
    try {
      await use(context);
    } finally {
      await context.close();
    }
  },
  extensionId: async ({ context }, use) => {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker'));
    await use(new URL(worker.url()).host);
  },
});

export const expect = test.expect;

export async function dismissCookieConsent(page: Page) {
  const consent = page.getByRole('button', {
    name: 'Accept necessary only',
    exact: true,
  });
  if (await consent.isVisible()) await consent.click();
}
