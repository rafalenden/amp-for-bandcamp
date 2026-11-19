import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import {
  FIXTURE_ORIGIN,
  RECORD_CLICKS,
  clicks,
  expectNewTab,
  resetClicks,
  serveFixture,
  waitForShortcuts,
} from './helpers';

const item = (n: number) => `<li class="collection-item-container">
  <a class="track_play_auxiliary" data-id="item-${n}">Play</a>
  <a href="${FIXTURE_ORIGIN}/album/item-${n}">Item ${n}</a>
  <div class="collection-item-actions" style="visibility: hidden">Actions</div>
  <div class="collection-item-fav-track" style="visibility: hidden">Favourite track</div>
</li>`;

// "Show more" loads the next page of items, as Bandcamp does.
const COLLECTION = `
  <div class="collection-container">
    <ol class="collection-grid">${[1, 2, 3].map(item).join('')}</ol>
    <button class="show-more" data-id="show-more">View all items</button>
  </div>
  <div class="carousel-player">
    <span class="playpause"><span class="play" data-id="player-play">Play</span></span>
    <span class="prev-icon disabled" data-id="player-prev">Prev</span>
    <span class="next-icon" data-id="player-next">Next</span>
  </div>
  <span class="wishlisted-msg collection-btn" data-id="wishlist">Wishlist</span>
  ${RECORD_CLICKS}
  <script>
    document.querySelector('.show-more').addEventListener('click', (event) => {
      event.target.remove();
      setTimeout(() => {
        document.querySelector('.collection-grid').insertAdjacentHTML(
          'beforeend',
          ${JSON.stringify([4, 5].map(item).join(''))},
        );
      }, 100);
    });
  </script>`;

async function openCollection(page: Page) {
  await page.goto(`${FIXTURE_ORIGIN}/fan`);
  await waitForShortcuts(page);
}

async function setPlayingItem(page: Page, n: number) {
  await page
    .locator('.collection-item-container')
    .evaluateAll(
      (items, current) =>
        items.forEach((el, index) =>
          el.classList.toggle('playing', index + 1 === current),
        ),
      n,
    );
}

test('expands the collection and reveals item actions', async ({
  context,
  page,
}) => {
  await serveFixture(context, COLLECTION);
  await openCollection(page);

  expect(await clicks(page)).toContain('show-more');
  await expect(page.locator('.collection-item-container')).toHaveCount(5);
  // Items loaded after "Show more" get their actions revealed too.
  for (const action of await page
    .locator('.collection-item-actions, .collection-item-fav-track')
    .all()) {
    await expect(action).toHaveCSS('visibility', 'visible');
  }
});

test('space and arrows use the collection player', async ({
  context,
  page,
}) => {
  await serveFixture(context, COLLECTION);
  await openCollection(page);
  await setPlayingItem(page, 2);
  await resetClicks(page);

  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  // The player's previous button is disabled, so fall back to the grid.
  await page.keyboard.press('ArrowUp');
  expect(await clicks(page)).toEqual(['player-play', 'player-next', 'item-1']);
});

test('falls back to grid items without the collection player', async ({
  context,
  page,
}) => {
  await serveFixture(context, COLLECTION);
  await openCollection(page);
  await page.locator('.carousel-player').evaluate((player) => player.remove());
  await resetClicks(page);

  // Nothing is playing yet: start the first item.
  await page.keyboard.press('Space');
  expect(await clicks(page)).toEqual(['item-1']);

  await setPlayingItem(page, 2);
  await resetClicks(page);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  expect(await clicks(page)).toEqual(['item-3', 'item-1']);
});

test('enter opens and W wishlists the playing item', async ({
  context,
  page,
}) => {
  await serveFixture(context, COLLECTION);
  await openCollection(page);
  await setPlayingItem(page, 3);
  await resetClicks(page);

  await expectNewTab(
    context,
    () => page.keyboard.press('Enter'),
    `${FIXTURE_ORIGIN}/album/item-3`,
  );
  await page.keyboard.press('KeyW');
  expect(await clicks(page)).toEqual(['wishlist']);
});
