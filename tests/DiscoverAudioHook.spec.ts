import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import {
  FIXTURE_ORIGIN,
  serveFixture,
  setSettings,
  waitForShortcuts,
} from './helpers';

// Like Bandcamp's discover page, the audio element is never attached to the DOM.
const DISCOVER = `
  <div id="DiscoverApp">
    <div class="floating-player">
      <div class="player-bar">
        <button class="play-pause-button" aria-label="Play"></button>
        <div class="track-progress">
          <input type="range" min="0" max="90" value="0" style="width: 400px">
        </div>
      </div>
    </div>
  </div>
  <script>
    window.player = new Audio('/audio.wav');
    window.sliderEvents = 0;
    document
      .querySelector('input[type="range"]')
      .addEventListener('mouseup', () => window.sliderEvents++);
    document.querySelector('.play-pause-button').onclick = () => window.player.play();
  </script>`;

type Fixture = { player: HTMLAudioElement; sliderEvents: number };
const player = <T>(page: Page, read: (audio: HTMLAudioElement) => T) =>
  page.evaluate(
    (fn) =>
      new Function('audio', `return (${fn})(audio)`)(
        (window as unknown as Fixture).player,
      ) as T,
    read.toString(),
  );

async function openAndPlay(page: Page) {
  await page.goto(`${FIXTURE_ORIGIN}/discover`);
  await waitForShortcuts(page);
  await page.locator('.play-pause-button').click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-amp-audio-hook',
    '1',
  );
  await expect.poll(() => player(page, (a) => a.paused)).toBe(false);
  // The readiness probe is a rewind that ran before the hook had any audio.
  await page.evaluate(() => {
    (window as unknown as Fixture).sliderEvents = 0;
  });
}

test('arrows seek the detached audio without touching the slider', async ({
  context,
  page,
}) => {
  await setSettings(context, { seekSeconds: 20 });
  await serveFixture(context, DISCOVER);
  await openAndPlay(page);

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(() => player(page, (a) => a.currentTime))
    .toBeGreaterThan(40);

  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => player(page, (a) => a.currentTime)).toBeLessThan(40);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => player(page, (a) => a.currentTime)).toBeLessThan(5);

  expect(
    await page.evaluate(() => (window as unknown as Fixture).sliderEvents),
  ).toBe(0);
});

test('volume settings reach the detached audio', async ({ context, page }) => {
  await setSettings(context, { volume: 35 });
  await serveFixture(context, DISCOVER);
  await openAndPlay(page);
  await expect.poll(() => player(page, (a) => a.volume)).toBe(0.35);

  await setSettings(context, { volume: 80 });
  await expect.poll(() => player(page, (a) => a.volume)).toBe(0.8);
});
