import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import {
  FIXTURE_ORIGIN,
  RECORD_CLICKS,
  clicks,
  expectNewTab,
  playAudio,
  resetClicks,
  serveFixture,
  setSettings,
  waitForAudio,
  waitForShortcuts,
} from './helpers';

const story = (n: number) => `<li class="story">
  <div class="collection-item-container track_play_hilite">
    <div class="story-body">
      <div class="tralbum-art-large" data-id="art-${n}"></div>
      <a href="${FIXTURE_ORIGIN}/album/story-${n}">Story ${n}</a>
      <div class="collect-item">
        <span class="wishlist-msg" data-id="wishlist-${n}">Wishlist</span>
        <span class="wishlisted-msg" data-id="unwishlist-${n}">In wishlist</span>
      </div>
    </div>
  </div>
</li>`;

// Story 2 is a non-playable post (for example a follow notification).
const FEED = `
  <div id="stories"><ul>
    ${story(1)}
    <li class="story"><p>Someone followed you</p></li>
    ${story(3)}
  </ul></div>
  <audio preload="auto" src="/audio.wav"></audio>
  ${RECORD_CLICKS}`;

async function openFeed(page: Page) {
  await page.goto(`${FIXTURE_ORIGIN}/feed`);
  await waitForShortcuts(page);
}

/** Sets Bandcamp's playing/paused classes on story `n` (1-based). */
async function setStoryState(
  page: Page,
  n: number,
  state: 'playing' | 'paused' | null,
) {
  await page
    .locator('.story')
    .nth(n - 1)
    .locator('.collection-item-container')
    .evaluate((item, value) => {
      item.classList.remove('playing', 'paused');
      if (value) item.classList.add(value);
    }, state);
}

test('space toggles the playing story, then the paused one, then the first', async ({
  context,
  page,
}) => {
  await serveFixture(context, FEED);
  await openFeed(page);

  await page.keyboard.press('Space');
  expect(await clicks(page)).toEqual(['art-1']);

  await setStoryState(page, 3, 'paused');
  await resetClicks(page);
  await page.keyboard.press('Space');
  expect(await clicks(page)).toEqual(['art-3']);

  await setStoryState(page, 3, 'playing');
  await resetClicks(page);
  await page.keyboard.press('Space');
  expect(await clicks(page)).toEqual(['art-3']);
});

test('arrow keys skip stories without a player', async ({ context, page }) => {
  await serveFixture(context, FEED);
  await openFeed(page);

  // Nothing is playing yet.
  await page.keyboard.press('ArrowDown');
  expect(await clicks(page)).toEqual([]);

  await setStoryState(page, 1, 'playing');
  await page.keyboard.press('ArrowDown');
  expect(await clicks(page)).toEqual(['art-3']);

  await setStoryState(page, 1, null);
  await setStoryState(page, 3, 'playing');
  await resetClicks(page);
  await page.keyboard.press('ArrowUp');
  expect(await clicks(page)).toEqual(['art-1']);

  // No story after the last one.
  await resetClicks(page);
  await page.keyboard.press('ArrowDown');
  expect(await clicks(page)).toEqual([]);
});

test('enter opens and W wishlists the playing story', async ({
  context,
  page,
}) => {
  await serveFixture(context, FEED);
  await openFeed(page);
  await setStoryState(page, 3, 'playing');

  await expectNewTab(
    context,
    () => page.keyboard.press('Enter'),
    `${FIXTURE_ORIGIN}/album/story-3`,
  );

  await page.keyboard.press('KeyW');
  expect(await clicks(page)).toEqual(['wishlist-3']);

  await page
    .locator('.story')
    .nth(2)
    .locator('.collect-item')
    .evaluate((item) => item.classList.add('wishlisted'));
  await resetClicks(page);
  await page.keyboard.press('KeyW');
  expect(await clicks(page)).toEqual(['unwishlist-3']);
});

test('progress bar follows the playing story and hides when disabled', async ({
  context,
  page,
}) => {
  await serveFixture(context, FEED);
  await openFeed(page);
  await waitForAudio(page);
  await setStoryState(page, 1, 'playing');
  await playAudio(page, 45);

  const first = page
    .locator('.story')
    .nth(0)
    .locator('.story-body > .playback-progress');
  await expect(first).toBeVisible();
  await expect
    .poll(() =>
      first
        .locator('.playback-progress-inner')
        .evaluate((inner) => parseFloat(inner.style.width)),
    )
    .toBeGreaterThanOrEqual(50);

  await setStoryState(page, 1, null);
  await setStoryState(page, 3, 'playing');
  await expect(
    page.locator('.story').nth(2).locator('.playback-progress'),
  ).toBeVisible();
  await expect(page.locator('.playback-progress')).toHaveCount(1);

  await setSettings(context, { showProgressBar: false });
  await expect(page.locator('.playback-progress')).toBeHidden();
});

test('auto-play starts the next playable story', async ({ context, page }) => {
  await serveFixture(context, FEED);
  await openFeed(page);
  await waitForAudio(page);
  await setStoryState(page, 1, 'playing');
  const duration = await page
    .locator('audio')
    .evaluate((audio: HTMLAudioElement) => audio.duration);
  // Slow playback keeps the last second open across the 700 ms check.
  await playAudio(page, duration - 0.95, 0.25);

  await expect.poll(() => clicks(page)).toContain('art-3');
});
