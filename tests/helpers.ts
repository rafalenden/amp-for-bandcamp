import type { BrowserContext, Page, Route } from '@playwright/test';
import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import type { browser } from 'wxt/browser';
import type { Settings } from '../src/constants';
import { buildPath } from './browsers/extension';
import { expect, extensionIn, test } from './fixtures';

/** The `chrome` global inside extension pages. */
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

/** A click track at `bpm`, for the BPM analyzer to detect. */
export function beatWav(bpm: number, seconds = 60) {
  const rate = 44100;
  const samples = rate * seconds;
  const wav = Buffer.alloc(44 + samples * 4);
  wav.write('RIFF');
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 4, 28);
  wav.writeUInt16LE(4, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(samples * 4, 40);
  for (let i = 0; i < samples; i++) {
    const t = (i / rate) % (60 / bpm);
    const sample = Math.round(
      30000 * Math.sin(2 * Math.PI * 80 * t) * Math.exp(-t * 30),
    );
    wav.writeInt16LE(sample, 44 + i * 4);
    wav.writeInt16LE(sample, 46 + i * 4);
  }
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

/** Writes settings to sync storage, as the popup would. */
export async function setSettings(
  context: BrowserContext,
  settings: Partial<Settings>,
) {
  await extensionIn(context).setStorage(settings);
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

/** Closes the page as a user would, and checks that it went without asking. */
export async function expectToCloseWithoutAsking(page: Page) {
  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.type());
    void dialog.accept();
  });
  const closed = new Promise<void>((resolve) =>
    page.once('close', () => resolve()),
  );
  await page.close({ runBeforeUnload: true });
  // Playwright's WebKit never finishes closing a page that has no
  // `beforeunload` listener, so there the check is only that nothing asks.
  if (test.info().project.use.browserName === 'webkit') {
    await Promise.race([closed, new Promise((done) => setTimeout(done, 500))]);
  } else {
    await closed;
  }
  expect(dialogs).toEqual([]);
}

export const BUILDS = ['chrome', 'firefox', 'safari'] as const;

/** Every file `npm run build` made for `browser`, by its path in the build. */
export function builtFiles(browser: (typeof BUILDS)[number]) {
  const root = buildPath(browser);
  return (readdirSync(root, { recursive: true }) as string[])
    .map((file) => file.split(path.sep).join('/'))
    .filter((file) => /\.\w+$/.test(file) && !file.endsWith('.DS_Store'))
    .sort()
    .map((file) => ({
      file,
      read: () => readFileSync(path.join(root, file), 'utf8'),
      size: readFileSync(path.join(root, file)).length,
    }));
}
