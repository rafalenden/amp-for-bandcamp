import { test, expect, dismissCookieConsent } from './fixtures';

const BAR = '.floating-player .player-bar';
const PLAYING = `${BAR} .play-pause-button[aria-label="Pause"]`;
const PAUSED = `${BAR} .play-pause-button[aria-label="Play"]`;
const SLIDER = `${BAR} .track-progress input[type="range"]`;
const TITLE = `${BAR} .track-title`;

async function startPlayback(page: import('@playwright/test').Page) {
  await page.goto('https://bandcamp.com/');
  await page.waitForLoadState('networkidle');
  await dismissCookieConsent(page);

  // Bandcamp fronts its pages with a CAPTCHA for fresh automated profiles.
  test.skip(
    await page.getByAltText('CAPTCHA image challenge').isVisible(),
    'Bandcamp served a CAPTCHA instead of the homepage',
  );

  const card = page.locator('.new-notable .card-item').first();
  await card.scrollIntoViewIfNeeded();
  await card.locator('.play-pause-button').click();
  await expect(page.locator(PLAYING)).toBeVisible();
  // Move focus off any interactive element so shortcuts are not ignored.
  await page.locator('body').click({ position: { x: 1, y: 1 } });
}

test('spacebar pauses and resumes playback', async ({ page }) => {
  await startPlayback(page);

  await page.keyboard.press('Space');
  await expect(page.locator(PAUSED)).toBeVisible();

  await page.keyboard.press('Space');
  await expect(page.locator(PLAYING)).toBeVisible();
});

test('arrow down and up move between tracks', async ({ page }) => {
  await startPlayback(page);
  const first = await page.locator(TITLE).innerText();

  await page.keyboard.press('ArrowDown');
  await expect(page.locator(TITLE)).not.toHaveText(first);

  await page.keyboard.press('ArrowUp');
  await expect(page.locator(TITLE)).toHaveText(first);
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
