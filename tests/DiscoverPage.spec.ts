import { test, expect, dismissCookieConsent } from './fixtures';

const PLAYING = '.floating-player .play-pause-button[aria-label="Pause"]';
const PAUSED = '.floating-player .play-pause-button[aria-label="Play"]';
const SLIDER = '.floating-player .track-progress input[type="range"]';

async function startPlayback(page: import('@playwright/test').Page) {
  await page.goto('https://bandcamp.com/discover');
  await page.waitForLoadState('networkidle');
  await dismissCookieConsent(page);

  // Bandcamp fronts /discover with a CAPTCHA for fresh automated profiles.
  test.skip(
    await page.getByAltText('CAPTCHA image challenge').isVisible(),
    'Bandcamp served a CAPTCHA instead of the discover page',
  );

  const items = page.locator('.results-grid-item');
  await expect(items.first()).toBeVisible();
  await items.first().locator('.play-pause-button').click();
  await expect(page.locator(PLAYING)).toBeVisible();
  // Move focus off any interactive element so shortcuts are not ignored.
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  return items;
}

test('spacebar pauses and resumes playback', async ({ page }) => {
  await startPlayback(page);

  await page.keyboard.press('Space');
  await expect(page.locator(PAUSED)).toBeVisible();

  await page.keyboard.press('Space');
  await expect(page.locator(PLAYING)).toBeVisible();
});

test('arrow down and up move between results', async ({ page }) => {
  const items = await startPlayback(page);

  await page.keyboard.press('ArrowDown');
  await expect(
    items.nth(1).locator('.play-pause-button[aria-label="Pause"]'),
  ).toBeVisible();

  await page.keyboard.press('ArrowUp');
  await expect(
    items.nth(0).locator('.play-pause-button[aria-label="Pause"]'),
  ).toBeVisible();
});

test('arrow right seeks forward', async ({ page }) => {
  await startPlayback(page);
  const slider = page.locator(SLIDER);
  const before = Number(await slider.inputValue());

  await page.keyboard.press('ArrowRight');
  await expect
    .poll(async () => Number(await slider.inputValue()))
    .toBeGreaterThan(before + 20);
});
