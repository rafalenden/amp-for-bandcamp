import { test, expect } from './fixtures';

// A local audio file keeps the extension integration test independent of Bandcamp's network/player.
function silentWav() {
  const samples = 8000 * 90;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(samples * 2, 40);
  return wav;
}

test('built content script controls playback and responds to popup settings', async ({
  context,
  page,
  extensionId,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.route('https://amp-test.bandcamp.com/**', async (route) => {
    if (route.request().url().endsWith('/audio.wav')) {
      const wav = silentWav();
      const range = /bytes=(\d+)-(\d*)/.exec(
        route.request().headers().range ?? '',
      );
      const start = Number(range?.[1] ?? 0);
      const end = range?.[2] ? Number(range[2]) : wav.length - 1;
      await route.fulfill({
        status: range ? 206 : 200,
        contentType: 'audio/wav',
        headers: {
          'Accept-Ranges': 'bytes',
          ...(range
            ? { 'Content-Range': `bytes ${start}-${end}/${wav.length}` }
            : {}),
        },
        body: wav.subarray(start, end + 1),
      });
    } else {
      await route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html>
        <div class="inline_player"><button class="playbutton">Play</button></div>
        <div id="tralbumArt"><img alt="Album art"></div>
        <input aria-label="Search" />
        <audio preload="auto" src="/audio.wav"></audio>
        <script>
          const audio = document.querySelector('audio');
          document.querySelector('button').onclick = () => audio.paused ? audio.play() : audio.pause();
        </script>`,
      });
    }
  });
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
