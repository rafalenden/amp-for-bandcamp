import type { BrowserContext, Page, Route } from '@playwright/test';
import type { browser } from 'wxt/browser';
import type { Settings } from '../src/constants';
import { expect } from './fixtures';

/** The `chrome` global inside extension pages and the service worker. */
export type ExtensionGlobal = { chrome: typeof browser };

export const FIXTURE_ORIGIN = 'https://amp-test.bandcamp.com';

// A local audio file keeps the extension integration tests independent of Bandcamp's network/player.
export function silentWav(seconds = 90) {
  const samples = 8000 * seconds;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(samples * 2, 40);
  return wav;
}

/** Serves a WAV with HTTP range support so the media element can seek. */
export async function fulfillAudio(route: Route, wav = silentWav()) {
  const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range ?? '');
  const start = Number(range?.[1] ?? 0);
  const end = range?.[2] ? Number(range[2]) : wav.length - 1;
  await route.fulfill({
    status: range ? 206 : 200,
    contentType: 'audio/wav',
    headers: {
      'Accept-Ranges': 'bytes',
      ...(range
        ? { 'Content-Range': `bytes ${start}-${end}/${wav.length}` }
        : {}),
    },
    body: wav.subarray(start, end + 1),
  });
}

/**
 * Records the `data-id` of every clicked element in `window.clicks`, so tests
 * can check which Bandcamp control the extension activated.
 */
export const RECORD_CLICKS = `<script>
  window.clicks = [];
  document.addEventListener('click', (event) => {
    const id = event.target.closest?.('[data-id]')?.dataset.id;
    if (id) window.clicks.push(id);
  }, true);
</script>`;

/**
 * Serves `body` as an HTML page for every fixture URL (except `.wav` files,
 * which get silent audio). The content script matches `*.bandcamp.com`.
 */
export async function serveFixture(context: BrowserContext, body: string) {
  await context.route(`${FIXTURE_ORIGIN}/**`, async (route) => {
    if (new URL(route.request().url()).pathname.endsWith('.wav')) {
      await fulfillAudio(route);
    } else {
      await route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><meta charset="utf-8">${body}`,
      });
    }
  });
}

export async function extensionWorker(context: BrowserContext) {
  return (
    context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  );
}

/** Writes settings to sync storage, as the popup would. */
export async function setSettings(
  context: BrowserContext,
  settings: Partial<Settings>,
) {
  const worker = await extensionWorker(context);
  await worker.evaluate(
    (values) =>
      (globalThis as unknown as ExtensionGlobal).chrome.storage.sync.set(
        values,
      ),
    settings,
  );
}

/**
 * Waits until the content script's keyboard handler is listening. ArrowLeft
 * (rewind) is harmless on every page, and the handler cancels the event.
 */
export async function waitForShortcuts(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const event = new KeyboardEvent('keydown', {
          code: 'ArrowLeft',
          bubbles: true,
          cancelable: true,
        });
        return !document.body.dispatchEvent(event);
      }),
    )
    .toBe(true);
}

export function clicks(page: Page) {
  return page.evaluate(
    () => (window as unknown as { clicks: string[] }).clicks,
  );
}

/** Clears recorded clicks so the next assertion only sees new ones. */
export async function resetClicks(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { clicks: string[] }).clicks = [];
  });
}

export function audioState(page: Page) {
  return page.locator('audio').evaluate((audio: HTMLAudioElement) => ({
    paused: audio.paused,
    currentTime: audio.currentTime,
    duration: audio.duration,
    volume: audio.volume,
  }));
}

export async function waitForAudio(page: Page) {
  await expect
    .poll(async () => (await audioState(page)).duration)
    .toBeGreaterThan(0);
}

/** Starts playback from page code, near `time` seconds if given. */
export async function playAudio(page: Page, time?: number, rate = 1) {
  await page.locator('audio').evaluate(
    async (audio: HTMLAudioElement, [start, playbackRate]) => {
      if (start !== undefined) audio.currentTime = start;
      audio.playbackRate = playbackRate!;
      await audio.play();
    },
    [time, rate] as const,
  );
}

/** Opens a new tab with `action` and returns it once it has a URL. */
export async function expectNewTab(
  context: BrowserContext,
  action: () => Promise<void>,
  url: string,
) {
  const [tab] = await Promise.all([context.waitForEvent('page'), action()]);
  await expect(tab).toHaveURL(url);
  await tab.close();
}
