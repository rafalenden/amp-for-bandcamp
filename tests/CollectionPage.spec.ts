import { test, expect, dismissCookieConsent } from './fixtures';

test('spacebar plays and pauses audio', async ({ page }) => {
  await page.goto('https://bandcamp.com/amp-for-bandcamp');
  await page.waitForLoadState('networkidle');

  await dismissCookieConsent(page);
  // Shortcuts intentionally ignore keyboard events from Bandcamp's menu bar.
  await page
    .getByRole('heading', { name: 'amp-for-bandcamp', exact: true })
    .click();

  await page.keyboard.press('Space');
  await expect(page.locator('.playpause .pause')).toBeVisible();
  await expect
    .poll(() =>
      page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.paused),
    )
    .toBe(false);

  await page.keyboard.press('Space');
  await expect(page.locator('.playpause .play')).toBeVisible();
  await expect
    .poll(() =>
      page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.paused),
    )
    .toBe(true);
});
