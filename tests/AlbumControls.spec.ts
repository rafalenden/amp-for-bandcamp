import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import {
  FIXTURE_ORIGIN,
  RECORD_CLICKS,
  audioState,
  clicks,
  expectNewTab,
  playAudio,
  resetClicks,
  serveFixture,
  setSettings,
  waitForAudio,
  waitForShortcuts,
} from './helpers';

const recommended = [1, 2, 3]
  .map(
    (n) => `<div class="recommended-album">
      <a class="play-button" data-id="rec-${n}">Play</a>
      <a class="album-link" href="${FIXTURE_ORIGIN}/album/rec-${n}">Rec ${n}</a>
      <img alt="Rec ${n} art">
    </div>`,
  )
  .join('');

// Mirrors the parts of Bandcamp's album markup that the extension reads.
const ALBUM = `
  <style id="custom-design-rules-style" data-design='{"body_color":"112233"}'></style>
  <div class="inline_player">
    <a class="playbutton" data-id="play">Play</a>
    <a class="prevbutton" data-id="prev">Prev</a>
    <a class="nextbutton" data-id="next">Next</a>
    <span class="time">0:00</span>
  </div>
  <div id="tralbumArt"><a><img alt="Album art"></a></div>
  <h4 class="wishlist"><span id="wishlist-msg" data-id="wishlist">Wishlist</span></h4>
  <table id="track_table"><tbody>
    <tr class="current_track"><td class="play_status" data-id="track-1"></td><td class="track-number-col">1</td></tr>
    <tr><td class="play_status" data-id="track-2"></td><td class="track-number-col">2</td></tr>
  </tbody></table>
  <div class="recommendations-content">${recommended}</div>
  ${RECORD_CLICKS}`;

const WITH_AUDIO = `${ALBUM}<audio preload="auto" src="/audio.wav"></audio>`;

async function openAlbum(page: Page) {
  await page.goto(`${FIXTURE_ORIGIN}/album/test`);
  await waitForShortcuts(page);
}

async function setCurrentTrack(page: Page, number: number) {
  await page.locator('#track_table tr').evaluateAll((rows, current) => {
    rows.forEach((row, index) =>
      row.classList.toggle('current_track', index + 1 === current),
    );
  }, number);
}

/** Marks a recommended album as the one Bandcamp is playing. */
async function playRecommended(page: Page, number: number) {
  await page
    .locator('.recommended-album .play-button')
    .evaluateAll(
      (buttons, current) =>
        buttons.forEach((button, index) =>
          button.classList.toggle('playing', index + 1 === current),
        ),
      number,
    );
}

/**
 * Starts the current track again, as Bandcamp does when it switches tracks.
 * The `pause` and `play` events reach the extension straight away, instead
 * of waiting for the next `timeupdate`, which a busy machine can hold back
 * for seconds.
 */
async function restartPlayback(page: Page) {
  await page.locator('audio').evaluate(async (audio: HTMLAudioElement) => {
    audio.pause();
    await audio.play();
  });
}

test('arrow keys and W use the album player controls', async ({
  context,
  page,
}) => {
  await serveFixture(context, ALBUM);
  await openAlbum(page);

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('KeyW');
  expect(await clicks(page)).toEqual(['next', 'prev', 'wishlist']);

  await page.locator('h4').evaluate((heading) => {
    heading.setAttribute('class', 'wishlisted');
    heading.innerHTML =
      '<span id="wishlisted-msg" data-id="unwishlist">In wishlist</span>';
  });
  await resetClicks(page);
  await page.keyboard.press('KeyW');
  expect(await clicks(page)).toEqual(['unwishlist']);
});

test('space clicks the play button before audio is ready', async ({
  context,
  page,
}) => {
  await serveFixture(context, ALBUM);
  await openAlbum(page);

  await page.keyboard.press('Space');
  expect(await clicks(page)).toEqual(['play']);
});

test('moves from the last album track to the recommendations and back', async ({
  context,
  page,
}) => {
  await serveFixture(context, ALBUM);
  await openAlbum(page);
  await setCurrentTrack(page, 2);

  await page.keyboard.press('ArrowDown');
  expect(await clicks(page)).toEqual(['rec-1']);

  await playRecommended(page, 1);
  await resetClicks(page);
  await page.keyboard.press('ArrowUp');
  expect(await clicks(page)).toEqual(['track-2']);
});

test('navigates, wishlists and opens recommended tracks', async ({
  context,
  page,
}) => {
  await serveFixture(context, ALBUM);
  await openAlbum(page);
  await playRecommended(page, 2);

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  expect(await clicks(page)).toEqual(['rec-3', 'rec-1']);

  // Wishlisting a recommendation opens its page, where Bandcamp offers the button.
  await expectNewTab(
    context,
    () => page.keyboard.press('KeyW'),
    `${FIXTURE_ORIGIN}/album/rec-2`,
  );
  await expectNewTab(
    context,
    () => page.keyboard.press('Enter'),
    `${FIXTURE_ORIGIN}/album/rec-2`,
  );
});

test('enter does not open a tab for album tracks', async ({
  context,
  page,
}) => {
  await serveFixture(context, ALBUM);
  await openAlbum(page);
  const pages = context.pages().length;

  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  expect(context.pages()).toHaveLength(pages);
});

test('sticky player uses the album theme colour', async ({ context, page }) => {
  await serveFixture(context, ALBUM);
  await page.goto(`${FIXTURE_ORIGIN}/album/test`);

  const player = page.locator('.inline_player');
  await expect(player).toHaveClass(/sticky/);
  await expect(player).toHaveCSS('background-color', 'rgb(17, 34, 51)');
  await expect(player).toHaveCSS('position', 'sticky');
});

test('sticky player and progress bar can be disabled before loading', async ({
  context,
  page,
}) => {
  await setSettings(context, { stickyPlayer: false, showProgressBar: false });
  await serveFixture(context, WITH_AUDIO);
  await openAlbum(page);
  await waitForAudio(page);
  await playAudio(page);
  // Progress updates during playback must not create the bar. The events are
  // fired here because the media clock can stall on a busy machine.
  await page.locator('audio').evaluate((audio: HTMLAudioElement) => {
    for (let i = 0; i < 4; i++) audio.dispatchEvent(new Event('timeupdate'));
  });

  await expect(page.locator('.inline_player')).not.toHaveClass(/sticky/);
  await expect(page.locator('.playback-progress')).toHaveCount(0);
});

test('progress bar follows the playing recommendation', async ({
  context,
  page,
}) => {
  await serveFixture(context, WITH_AUDIO);
  await openAlbum(page);
  await waitForAudio(page);
  await playRecommended(page, 2);
  await playAudio(page, 45);

  const bar = page
    .locator('.recommended-album')
    .nth(1)
    .locator('.album-art-progress');
  await expect(bar).toBeVisible();
  // Inserted right after the artwork.
  await expect(
    page
      .locator('.recommended-album')
      .nth(1)
      .locator('img + .playback-progress'),
  ).toHaveCount(1);
  await expect
    .poll(() =>
      bar
        .locator('.playback-progress-inner')
        .evaluate((inner) => parseFloat(inner.style.width)),
    )
    .toBeGreaterThanOrEqual(50);

  await playRecommended(page, 0);
  await restartPlayback(page);
  await expect(page.locator('#tralbumArt .album-art-progress')).toBeVisible();
  await expect(page.locator('.playback-progress')).toHaveCount(1);
});

test('progress bar stays hidden after disabling it during playback', async ({
  context,
  page,
}) => {
  await serveFixture(context, WITH_AUDIO);
  await openAlbum(page);
  await waitForAudio(page);
  await playAudio(page, 10);
  await expect(page.locator('#tralbumArt .playback-progress')).toBeVisible();

  await setSettings(context, { showProgressBar: false });
  // The change reaches the content script asynchronously; wait for it, then
  // check that later progress updates do not bring the bar back. The events
  // are fired here because the media clock can stall on a busy machine.
  await expect(page.locator('.playback-progress')).toBeHidden();
  await page.locator('audio').evaluate((audio: HTMLAudioElement) => {
    for (let i = 0; i < 4; i++) audio.dispatchEvent(new Event('timeupdate'));
  });
  expect(await page.locator('.playback-progress').isVisible()).toBe(false);
  expect((await audioState(page)).paused).toBe(false);

  await setSettings(context, { showProgressBar: true });
  await expect(page.locator('#tralbumArt .playback-progress')).toBeVisible();
  await expect(page.locator('.playback-progress')).toHaveCount(1);
});

test('progress bar hides when the track ends', async ({
  context,
  page,
  browserName,
}) => {
  await serveFixture(context, WITH_AUDIO);
  await openAlbum(page);
  await waitForAudio(page);
  await playAudio(page, 0);
  await expect(page.locator('#tralbumArt .playback-progress')).toBeVisible();

  // Seeking to the very end ends the track at once, without waiting on the
  // media clock, which a busy machine can hold back for seconds. Firefox
  // never finishes a seek to the exact end, so there the track plays out its
  // last moments.
  const fromEnd = browserName === 'firefox' ? 0.2 : 0;
  await page.locator('audio').evaluate((audio: HTMLAudioElement, offset) => {
    audio.currentTime = audio.duration - offset;
  }, fromEnd);
  await expect
    .poll(async () => (await audioState(page)).paused, { timeout: 15_000 })
    .toBe(true);
  await expect(page.locator('.playback-progress')).toBeHidden();
});

test.describe('auto-play next', () => {
  // Slow playback keeps the last second of the track open across the 700 ms check.
  const playEnding = (page: Page) =>
    page
      .locator('audio')
      .evaluate((audio: HTMLAudioElement) => audio.duration - 0.95)
      .then((time) => playAudio(page, time, 0.25));

  test('starts the first recommendation after the last album track', async ({
    context,
    page,
  }) => {
    await serveFixture(context, WITH_AUDIO);
    await openAlbum(page);
    await waitForAudio(page);
    await setCurrentTrack(page, 2);
    await playEnding(page);

    await expect.poll(() => clicks(page)).toContain('rec-1');
  });

  test('continues through recommendations', async ({ context, page }) => {
    await serveFixture(context, WITH_AUDIO);
    await openAlbum(page);
    await waitForAudio(page);
    await playRecommended(page, 1);
    await playEnding(page);

    await expect.poll(() => clicks(page)).toContain('rec-2');
  });

  test('leaves mid-album tracks to Bandcamp', async ({ context, page }) => {
    await serveFixture(context, WITH_AUDIO);
    await openAlbum(page);
    await waitForAudio(page);
    await playEnding(page);

    await page.waitForTimeout(2000);
    expect(await clicks(page)).toEqual([]);
  });

  test('does nothing when disabled', async ({ context, page }) => {
    await setSettings(context, { autoPlayNext: false });
    await serveFixture(context, WITH_AUDIO);
    await openAlbum(page);
    await waitForAudio(page);
    await setCurrentTrack(page, 2);
    await playEnding(page);

    await page.waitForTimeout(2000);
    expect(await clicks(page)).toEqual([]);
  });
});
