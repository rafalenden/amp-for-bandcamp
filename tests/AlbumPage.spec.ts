import { test, expect, dismissCookieConsent } from './fixtures';

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
