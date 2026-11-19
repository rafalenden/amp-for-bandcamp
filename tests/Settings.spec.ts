import type { BrowserContext } from '@playwright/test';
import { test, expect } from './fixtures';
import {
  FIXTURE_ORIGIN,
  audioState,
  extensionWorker,
  serveFixture,
  setSettings,
  waitForAudio,
  waitForShortcuts,
  type ExtensionGlobal,
} from './helpers';

/** Writes raw values, bypassing the popup's typed controls. */
async function writeRaw(context: BrowserContext, values: object) {
  const worker = await extensionWorker(context);
  await worker.evaluate(
    (items) =>
      (globalThis as unknown as ExtensionGlobal).chrome.storage.sync.set(items),
    values,
  );
}

async function removeSetting(context: BrowserContext, key: string) {
  const worker = await extensionWorker(context);
  await worker.evaluate(
    (name) =>
      (globalThis as unknown as ExtensionGlobal).chrome.storage.sync.remove(
        name,
      ),
    key,
  );
}

test('popup shows the defaults on first run', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);

  await expect(page.locator('#volumeSlider')).toBeEnabled();
  await expect(page.locator('#volumeValue')).toHaveText('100%');
  await expect(page.locator('#seekSecondsValue')).toHaveText('30s');
  const checkboxes = page.getByRole('checkbox');
  await expect(checkboxes).toHaveCount(6);
  for (const checkbox of await checkboxes.all()) {
    await expect(checkbox).toBeChecked();
  }
  await expect(page.locator('#keyboardShortcutsSection dt')).toHaveText([
    'space',
    '↑',
    '↓',
    '→',
    '←',
    'w',
    'enter',
  ]);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('popup follows outside changes, ignores invalid values and restores defaults', async ({
  context,
  page,
  extensionId,
}) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.locator('#volumeSlider')).toBeEnabled();

  await setSettings(context, { volume: 70, enableKeyboardShortcuts: false });
  await expect(page.locator('#volumeValue')).toHaveText('70%');
  await expect(page.locator('#keyboardShortcutsSection')).toBeHidden();

  await writeRaw(context, { volume: 'loud', enableKeyboardShortcuts: 1 });
  await page.waitForTimeout(300);
  await expect(page.locator('#volumeValue')).toHaveText('70%');
  await expect(page.locator('#keyboardShortcutsSection')).toBeHidden();

  await removeSetting(context, 'volume');
  await removeSetting(context, 'enableKeyboardShortcuts');
  await expect(page.locator('#volumeValue')).toHaveText('100%');
  await expect(page.locator('#keyboardShortcutsSection')).toBeVisible();
});

test('content script ignores invalid values and restores removed settings', async ({
  context,
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await setSettings(context, { volume: 30 });
  await serveFixture(
    context,
    `<div class="inline_player"></div><audio preload="auto" src="/audio.wav"></audio>`,
  );
  await page.goto(`${FIXTURE_ORIGIN}/album/test`);
  await waitForShortcuts(page);
  await waitForAudio(page);
  expect((await audioState(page)).volume).toBe(0.3);

  await writeRaw(context, { volume: 'loud', stickyPlayer: 'no' });
  await page.waitForTimeout(300);
  expect((await audioState(page)).volume).toBe(0.3);
  await expect(page.locator('.inline_player')).toHaveClass(/sticky/);

  await setSettings(context, { stickyPlayer: false });
  await expect(page.locator('.inline_player')).not.toHaveClass(/sticky/);
  await removeSetting(context, 'volume');
  await removeSetting(context, 'stickyPlayer');
  await expect.poll(async () => (await audioState(page)).volume).toBe(1);
  await expect(page.locator('.inline_player')).toHaveClass(/sticky/);
  expect(errors).toEqual([]);
});
