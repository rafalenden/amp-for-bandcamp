import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import {
  FIXTURE_ORIGIN,
  RECORD_CLICKS,
  clicks,
  serveFixture,
  setSettings,
  waitForShortcuts,
} from './helpers';

// Live pages also contain an album-style player, but the live controller must win.
const LIVE = `
  <div class="inline_player"></div>
  <input class="volume-control" type="range" min="0" max="100" value="100" aria-label="Volume">
  <button class="wishlist-button" data-id="wishlist">Wishlist</button>
  ${RECORD_CLICKS}
  <script>
    window.volumes = [];
    document.querySelector('.volume-control').addEventListener('input', (event) =>
      window.volumes.push(Number(event.target.value)));
  </script>`;

const volumes = (page: Page) =>
  page.evaluate(() => (window as unknown as { volumes: number[] }).volumes);

test('sets the stream volume from settings and follows changes', async ({
  context,
  page,
}) => {
  await setSettings(context, { volume: 40 });
  await serveFixture(context, LIVE);
  await page.goto(`${FIXTURE_ORIGIN}/live/test`);
  await waitForShortcuts(page);

  const slider = page.getByRole('slider', { name: 'Volume' });
  await expect(slider).toHaveValue('40');
  expect(await volumes(page)).toEqual([40]);

  await setSettings(context, { volume: 75 });
  await expect(slider).toHaveValue('75');
  expect(await volumes(page)).toEqual([40, 75]);
  // The album controller would have made the player sticky.
  await expect(page.locator('.inline_player')).not.toHaveClass(/sticky/);
});

test('W wishlists the stream', async ({ context, page }) => {
  await serveFixture(context, LIVE);
  await page.goto(`${FIXTURE_ORIGIN}/live/test`);
  await waitForShortcuts(page);

  await page.keyboard.press('KeyW');
  expect(await clicks(page)).toEqual(['wishlist']);
});

test('always asks before leaving a live stream unless disabled', async ({
  context,
  page,
}) => {
  await serveFixture(context, LIVE);
  await page.goto(`${FIXTURE_ORIGIN}/live/test`);
  await waitForShortcuts(page);
  // Browsers only show the prompt after the user has interacted with the page.
  await page.getByRole('button', { name: 'Wishlist' }).click();

  const dialog = page.waitForEvent('dialog');
  await page.close({ runBeforeUnload: true });
  expect((await dialog).type()).toBe('beforeunload');
  await (await dialog).dismiss();

  await setSettings(context, { showLeaveWarning: false });
  await page.waitForTimeout(300);
  const dialogs: string[] = [];
  page.on('dialog', (next) => {
    dialogs.push(next.type());
    void next.accept();
  });
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => page.isClosed()).toBe(true);
  expect(dialogs).toEqual([]);
});
