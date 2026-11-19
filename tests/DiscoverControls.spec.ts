import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import {
  FIXTURE_ORIGIN,
  RECORD_CLICKS,
  clicks,
  expectNewTab,
  resetClicks,
  serveFixture,
  setSettings,
  waitForShortcuts,
} from './helpers';

const result = (n: number) => `<div class="results-grid-item">
  <button class="play-pause-button" aria-label="Play" data-id="result-${n}"></button>
  <a href="${FIXTURE_ORIGIN}/album/result-${n}?from=discover_page">Result ${n}</a>
</div>`;

// Bandcamp's discover page has no <audio>; the slider max is the track length in seconds.
const DISCOVER = `
  <div id="DiscoverApp">
    <div class="results-grid">${[1, 2, 3].map(result).join('')}</div>
    <div class="floating-player">
      <div class="player-bar">
        <button class="play-pause-button" aria-label="Play" data-id="player-toggle"></button>
        <button class="prev-track" data-id="player-prev"></button>
        <button class="next-track" data-id="player-next"></button>
        <div class="track-meta"><a href="${FIXTURE_ORIGIN}/album/result-2">Result 2</a></div>
        <div class="track-progress">
          <input type="range" min="0" max="200" value="50" style="width: 400px">
        </div>
        <button class="wishlist-button" data-id="wishlist"></button>
      </div>
    </div>
  </div>
  ${RECORD_CLICKS}
  <script>
    window.seeks = [];
    const slider = document.querySelector('input[type="range"]');
    // Bandcamp commits a seek when the mouse is released.
    slider.addEventListener('mouseup', () => window.seeks.push(Number(slider.value)));
  </script>`;

async function openDiscover(page: Page) {
  await page.goto(`${FIXTURE_ORIGIN}/discover`);
  await waitForShortcuts(page);
  // The readiness probe is a rewind, so start each test from a clean slate.
  await resetClicks(page);
  await setSlider(page, 50);
}

async function setSlider(page: Page, value: number) {
  await page.locator('input[type="range"]').evaluate((slider, v) => {
    (slider as HTMLInputElement).value = String(v);
    (window as unknown as { seeks: number[] }).seeks = [];
  }, value);
}

const seeks = (page: Page) =>
  page.evaluate(() => (window as unknown as { seeks: number[] }).seeks);

async function setPlayingResult(page: Page, n: number | null) {
  await page
    .locator('.results-grid-item .play-pause-button')
    .evaluateAll(
      (buttons, current) =>
        buttons.forEach((button, index) =>
          button.setAttribute(
            'aria-label',
            index + 1 === current ? 'Pause' : 'Play',
          ),
        ),
      n,
    );
}

test('space uses the floating player', async ({ context, page }) => {
  await serveFixture(context, DISCOVER);
  await openDiscover(page);

  await page.keyboard.press('Space');
  expect(await clicks(page)).toEqual(['player-toggle']);
});

test('arrows move between results while playing', async ({ context, page }) => {
  await serveFixture(context, DISCOVER);
  await openDiscover(page);
  await setPlayingResult(page, 2);

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  expect(await clicks(page)).toEqual(['result-3', 'result-1']);
});

test('finds the paused result from the player link, ignoring tracking params', async ({
  context,
  page,
}) => {
  await serveFixture(context, DISCOVER);
  await openDiscover(page);

  await page.keyboard.press('ArrowDown');
  expect(await clicks(page)).toEqual(['result-3']);
  await expectNewTab(
    context,
    () => page.keyboard.press('Enter'),
    `${FIXTURE_ORIGIN}/album/result-2?from=discover_page`,
  );
});

test('falls back to the player buttons at the ends of the grid', async ({
  context,
  page,
}) => {
  await serveFixture(context, DISCOVER);
  await openDiscover(page);

  await setPlayingResult(page, 3);
  await page.keyboard.press('ArrowDown');
  await setPlayingResult(page, 1);
  await page.keyboard.press('ArrowUp');
  expect(await clicks(page)).toEqual(['player-next', 'player-prev']);
});

test('seeks with the slider and clamps to the track', async ({
  context,
  page,
}) => {
  await setSettings(context, { seekSeconds: 20 });
  await serveFixture(context, DISCOVER);
  await openDiscover(page);

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  expect(await seeks(page)).toEqual([70, 50, 30, 10]);

  await setSlider(page, 15);
  await page.keyboard.press('ArrowLeft');
  expect(await seeks(page)).toEqual([0]);
  await setSlider(page, 190);
  await page.keyboard.press('ArrowRight');
  expect(await seeks(page)).toEqual([200]);
  await expect(page.locator('input[type="range"]')).toHaveValue('200');
});

test('W wishlists the playing track', async ({ context, page }) => {
  await serveFixture(context, DISCOVER);
  await openDiscover(page);

  await page.keyboard.press('KeyW');
  expect(await clicks(page)).toEqual(['wishlist']);
});
