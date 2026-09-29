import { test, expect, dismissCookieConsent } from './fixtures';

test('detects BPM on a real album page', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('https://aimedrec.bandcamp.com/album/aimed-001');
  await expect(page.locator('.bpm-display')).toHaveText(/\d+ BPM/, {
    timeout: 45000,
  });
});

test('spacebar plays and pauses audio', async ({ page }) => {
  await page.goto('https://rethe.bandcamp.com/album/trust-the-process');
  await page.waitForLoadState('networkidle');
  await dismissCookieConsent(page);
  await page
    .getByRole('heading', { name: 'Trust the Process', exact: true })
    .click();

  await page.keyboard.press('Space');
  await expect(page.locator('.playbutton.playing')).toBeVisible();

  await page.keyboard.press('Space');
  await expect(page.locator('.playbutton:not(.playing)')).toBeVisible();
});
