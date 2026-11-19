import { chromium, type BrowserContext } from '@playwright/test';
import {
  AUDIO_URL,
  buildPath,
  removeFromStorage,
  setInStorage,
  type ExtensionPage,
  type LoadedExtension,
} from './extension';

async function serviceWorker(context: BrowserContext) {
  return (
    context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  );
}

export async function loadInChromium(): Promise<LoadedExtension> {
  const pathToExtension = process.env.EXTENSION_PATH ?? buildPath('chrome');
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
    const origin = `chrome-extension://${new URL((await serviceWorker(context)).url()).host}`;

    const open = async (file: string): Promise<ExtensionPage> => {
      const page = await context.newPage();
      await page.goto(`${origin}/${file}`);
      return page;
    };
    return {
      context,
      close: () => context.close(),
      extension: {
        openPopup: () => open('popup.html'),
        openAnalyzer: () => open('bpm-analyzer.html'),
        async setStorage(values) {
          await (await serviceWorker(context)).evaluate(setInStorage, values);
        },
        async removeStorage(key) {
          await (await serviceWorker(context)).evaluate(removeFromStorage, key);
        },
        async routeAudio(handler) {
          await context.route(AUDIO_URL, async (route) => {
            if (!route.request().serviceWorker()) return route.abort();
            const response = await handler(route.request().url());
            // The request may be gone by now, e.g. when its analysis was cancelled.
            await route.fulfill(response).catch(() => {});
          });
        },
      },
    };
  } catch (error) {
    await context.close();
    throw error;
  }
}
