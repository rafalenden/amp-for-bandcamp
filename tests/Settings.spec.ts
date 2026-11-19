import { test, expect } from './fixtures';
import {
  FIXTURE_ORIGIN,
  audioState,
  serveFixture,
  setSettings,
  waitForAudio,
  waitForShortcuts,
} from './helpers';

test('popup shows the defaults on first run', async ({ extension }) => {
  const popup = await extension.openPopup();

  await expect(popup.locator('#volumeSlider')).toBeEnabled();
  await expect(popup.locator('#volumeValue')).toHaveText('100%');
  await expect(popup.locator('#seekSecondsValue')).toHaveText('30s');
  const checkboxes = popup.getByRole('checkbox');
  await expect(checkboxes).toHaveCount(6);
  for (const checkbox of await checkboxes.all()) {
    await expect(checkbox).toBeChecked();
  }
  await expect(popup.locator('#keyboardShortcutsSection dt')).toHaveText([
    'space',
    '↑',
    '↓',
    '→',
    '←',
    'w',
    'enter',
  ]);
  await expect(popup.getByRole('alert')).toHaveCount(0);
});

test('popup follows outside changes, ignores invalid values and restores defaults', async ({
  context,
  page,
  extension,
}) => {
  const popup = await extension.openPopup();
  await expect(popup.locator('#volumeSlider')).toBeEnabled();

  await setSettings(context, { volume: 70, enableKeyboardShortcuts: false });
  await expect(popup.locator('#volumeValue')).toHaveText('70%');
  await expect(popup.locator('#keyboardShortcutsSection')).toBeHidden();

  // Raw values, which the popup's typed controls could not write.
  await extension.setStorage({ volume: 'loud', enableKeyboardShortcuts: 1 });
  await page.waitForTimeout(300);
  await expect(popup.locator('#volumeValue')).toHaveText('70%');
  await expect(popup.locator('#keyboardShortcutsSection')).toBeHidden();

  await extension.removeStorage('volume');
  await extension.removeStorage('enableKeyboardShortcuts');
  await expect(popup.locator('#volumeValue')).toHaveText('100%');
  await expect(popup.locator('#keyboardShortcutsSection')).toBeVisible();
});

test('content script ignores invalid values and restores removed settings', async ({
  context,
  page,
  extension,
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
  expect((await audioState(page)).volume).toBeCloseTo(0.3);

  await extension.setStorage({ volume: 'loud', stickyPlayer: 'no' });
  await page.waitForTimeout(300);
  expect((await audioState(page)).volume).toBeCloseTo(0.3);
  await expect(page.locator('.inline_player')).toHaveClass(/sticky/);

  await setSettings(context, { stickyPlayer: false });
  await expect(page.locator('.inline_player')).not.toHaveClass(/sticky/);
  await extension.removeStorage('volume');
  await extension.removeStorage('stickyPlayer');
  await expect.poll(async () => (await audioState(page)).volume).toBe(1);
  await expect(page.locator('.inline_player')).toHaveClass(/sticky/);
  expect(errors).toEqual([]);
});
