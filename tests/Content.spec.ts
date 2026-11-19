import { test, expect } from './fixtures';
import { serveFixture } from './helpers';

test('built content script controls playback and responds to popup settings', async ({
  context,
  page,
  extensionId,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await serveFixture(
    context,
    `<div class="inline_player"><button class="playbutton">Play</button></div>
    <div id="tralbumArt"><img alt="Album art"></div>
    <input aria-label="Search" />
    <audio preload="auto" src="/audio.wav"></audio>
    <script>
      const audio = document.querySelector('audio');
      document.querySelector('button').onclick = () => audio.paused ? audio.play() : audio.pause();
    </script>`,
  );
  await page.goto('https://amp-test.bandcamp.com/album/test');
  await expect(page.locator('.inline_player')).toHaveClass(/sticky/);
  await expect
    .poll(() =>
      page
        .locator('audio')
        .evaluate((audio: HTMLAudioElement) => audio.readyState),
    )
    .toBeGreaterThan(0);
  await page.keyboard.press('Space');
  await expect
    .poll(() =>
      page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.paused),
    )
    .toBe(false);
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(() =>
      page
        .locator('audio')
        .evaluate((audio: HTMLAudioElement) => audio.currentTime),
    )
    .toBeGreaterThan(30);
  await expect(page.locator('.playback-progress')).toBeVisible();
  await page.keyboard.press('Space');
  await expect
    .poll(() =>
      page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.paused),
    )
    .toBe(true);

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.locator('#volumeSlider')).toBeEnabled();
  await popup.getByRole('slider', { name: 'Track volume' }).fill('35');
  await popup
    .getByRole('checkbox', { name: 'Pin player to the top of the album page' })
    .uncheck();
  await expect
    .poll(() =>
      page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.volume),
    )
    .toBe(0.35);
  await expect(page.locator('.inline_player')).not.toHaveClass(/sticky/);

  await page.getByRole('textbox', { name: 'Search' }).focus();
  await page.keyboard.press('Space');
  await expect
    .poll(() =>
      page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.paused),
    )
    .toBe(true);
  expect(errors).toEqual([]);
});
