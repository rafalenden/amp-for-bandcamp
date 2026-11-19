import { test as base, chromium, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

export const test = base.extend<{ extensionId: string }>({
  context: async ({}, use) => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const pathToExtension =
      process.env.EXTENSION_PATH ??
      path.join(__dirname, '..', '.output', 'chrome-mv3');
    // BROWSER_CHANNEL=chrome (or msedge) runs the suite in an installed branded
    // browser. Those ignore --load-extension, so the extension is loaded through
    // the DevTools protocol instead.
    const channel = process.env.BROWSER_CHANNEL ?? 'chromium';
    const branded = channel !== 'chromium';
    const context = await chromium.launchPersistentContext('', {
      channel,
      // A copy of Chromium that stays out of the macOS Dock (see global-setup.ts).
      executablePath: branded ? undefined : process.env.HIDDEN_CHROMIUM_PATH,
      ...(branded
        ? {
            ignoreDefaultArgs: ['--disable-extensions'],
            args: ['--enable-unsafe-extension-debugging'],
          }
        : {
            args: [
              `--disable-extensions-except=${pathToExtension}`,
              `--load-extension=${pathToExtension}`,
            ],
          }),
    });
    try {
      if (branded) {
        const cdp = await context.browser()!.newBrowserCDPSession();
        await cdp.send('Extensions.loadUnpacked', { path: pathToExtension });
      }
      // Pages opened before the extension finishes loading never get the content script.
      if (!context.serviceWorkers().length)
        await context.waitForEvent('serviceworker');
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
