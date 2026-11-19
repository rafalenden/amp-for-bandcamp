import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import {
  FIXTURE_ORIGIN,
  audioState,
  playAudio,
  serveFixture,
  setSettings,
  waitForAudio,
  waitForShortcuts,
} from './helpers';

// The album controller is the simplest page that drives <audio> directly.
const ALBUM = `
  <div class="inline_player"><span class="time">0:00</span></div>
  <textarea aria-label="Notes"></textarea>
  <audio preload="auto" src="/audio.wav"></audio>`;

const currentTime = async (page: Page) => (await audioState(page)).currentTime;
const isPaused = async (page: Page) => (await audioState(page)).paused;

async function openAlbum(page: Page) {
  await page.goto(`${FIXTURE_ORIGIN}/album/test`);
  await waitForShortcuts(page);
  await waitForAudio(page);
}

async function seekTo(page: Page, time: number) {
  await page.locator('audio').evaluate((audio: HTMLAudioElement, t) => {
    audio.currentTime = t;
  }, time);
}

test('seeks by the stored duration and picks up changes live', async ({
  context,
  page,
}) => {
  await setSettings(context, { seekSeconds: 10, volume: 25 });
  await serveFixture(context, ALBUM);
  await openAlbum(page);
  expect((await audioState(page)).volume).toBe(0.25);

  await page.keyboard.press('Space');
  await expect.poll(() => isPaused(page)).toBe(false);
  let before = await currentTime(page);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => currentTime(page)).toBeGreaterThan(before + 9);
  expect(await currentTime(page)).toBeLessThan(before + 12);

  before = await currentTime(page);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => currentTime(page)).toBeLessThan(before - 8);

  await setSettings(context, { seekSeconds: 40 });
  await page.waitForTimeout(300); // storage.onChanged reaches the tab asynchronously
  before = await currentTime(page);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => currentTime(page)).toBeGreaterThan(before + 39);
  expect(await currentTime(page)).toBeLessThan(before + 42);
});

test('rewind stops at the start and fast-forward never skips past the end', async ({
  context,
  page,
}) => {
  await serveFixture(context, ALBUM);
  await openAlbum(page);
  await playAudio(page, 10);

  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => currentTime(page)).toBeLessThan(2);

  // 30 s seek with 20 s left: stay on the track instead of ending it.
  const duration = (await audioState(page)).duration;
  await seekTo(page, duration - 20);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  expect(await currentTime(page)).toBeLessThan(duration - 18);
  expect(await isPaused(page)).toBe(false);
});

test('fast-forward is ignored while paused', async ({ context, page }) => {
  await serveFixture(context, ALBUM);
  await openAlbum(page);
  await seekTo(page, 5);

  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  expect(await currentTime(page)).toBe(5);
});

test('shortcuts can be disabled and are ignored while typing', async ({
  context,
  page,
}) => {
  await setSettings(context, { enableKeyboardShortcuts: false });
  await serveFixture(context, ALBUM);
  await page.goto(`${FIXTURE_ORIGIN}/album/test`);
  await expect(page.locator('.inline_player')).toHaveClass(/sticky/);
  await waitForAudio(page);

  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  expect(await isPaused(page)).toBe(true);

  await setSettings(context, { enableKeyboardShortcuts: true });
  await waitForShortcuts(page);

  await page.getByRole('textbox', { name: 'Notes' }).focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  expect(await isPaused(page)).toBe(true);
  await expect(page.getByRole('textbox', { name: 'Notes' })).toHaveValue(' ');

  await page.getByRole('textbox', { name: 'Notes' }).blur();
  await page.keyboard.press('Space');
  await expect.poll(() => isPaused(page)).toBe(false);
});

test('volume applies to audio players added later', async ({
  context,
  page,
}) => {
  await setSettings(context, { volume: 60 });
  await serveFixture(context, `<div class="inline_player"></div>`);
  await page.goto(`${FIXTURE_ORIGIN}/album/test`);
  await waitForShortcuts(page);

  // The controller polls every second until Bandcamp inserts its player.
  await page.evaluate(() => {
    const audio = document.createElement('audio');
    audio.src = '/audio.wav';
    document.body.append(audio);
  });
  await expect.poll(async () => (await audioState(page)).volume).toBe(0.6);
});

test.describe('leave warning', () => {
  test('asks before leaving while music plays', async ({ context, page }) => {
    await serveFixture(context, ALBUM);
    await openAlbum(page);
    // Browsers only show the prompt after the user has interacted with the page.
    await page.keyboard.press('Space');
    await expect.poll(() => isPaused(page)).toBe(false);

    const dialog = page.waitForEvent('dialog');
    await page.close({ runBeforeUnload: true });
    expect((await dialog).type()).toBe('beforeunload');
    await (await dialog).dismiss();
    expect(page.isClosed()).toBe(false);
  });

  test('lets the page close while paused', async ({ context, page }) => {
    await serveFixture(context, ALBUM);
    await openAlbum(page);
    await page.keyboard.press('Space');
    await page.keyboard.press('Space');
    await expect.poll(() => isPaused(page)).toBe(true);

    const dialogs: string[] = [];
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.type());
      void dialog.accept();
    });
    await page.close({ runBeforeUnload: true });
    await expect.poll(() => page.isClosed()).toBe(true);
    expect(dialogs).toEqual([]);
  });

  test('can be disabled', async ({ context, page }) => {
    await serveFixture(context, ALBUM);
    await openAlbum(page);
    await page.keyboard.press('Space');
    await expect.poll(() => isPaused(page)).toBe(false);
    await setSettings(context, { showLeaveWarning: false });
    await page.waitForTimeout(300);

    const dialogs: string[] = [];
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.type());
      void dialog.accept();
    });
    await page.close({ runBeforeUnload: true });
    await expect.poll(() => page.isClosed()).toBe(true);
    expect(dialogs).toEqual([]);
  });
});

test('ignores Bandcamp pages without a supported player', async ({
  context,
  page,
}) => {
  await serveFixture(context, `<p>Nothing to control</p>`);
  await page.goto(`${FIXTURE_ORIGIN}/about`);
  await page.waitForTimeout(1500);

  const handled = await page.evaluate(() => {
    const event = new KeyboardEvent('keydown', {
      code: 'Space',
      bubbles: true,
      cancelable: true,
    });
    return !document.body.dispatchEvent(event);
  });
  expect(handled).toBe(false);
});
