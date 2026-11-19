import { test as base, type BrowserContext, type Page } from '@playwright/test';
import { loadInChromium } from './browsers/chromium';
import type { Extension } from './browsers/extension';
import { loadInFirefox } from './browsers/firefox';
import { loadInWebKit } from './browsers/webkit';

export type { Extension, ExtensionPage } from './browsers/extension';

const load = {
  chromium: loadInChromium,
  firefox: loadInFirefox,
  webkit: loadInWebKit,
};
const extensions = new WeakMap<BrowserContext, Extension>();

/** The extension loaded into `context`. */
export function extensionIn(context: BrowserContext) {
  return extensions.get(context)!;
}

export const test = base.extend<{ extension: Extension }>({
  // Each test gets a fresh browser profile with the extension loaded.
  context: async ({ browserName }, use) => {
    const { context, extension, close } = await load[browserName]();
    extensions.set(context, extension);
    try {
      await use(context);
    } finally {
      await close();
    }
  },
  extension: async ({ context }, use) => {
    await use(extensionIn(context));
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
