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

// A row of the pop-up tracklist. Like Bandcamp's, it has its own play and wishlist buttons.
const row = (n: number, current: number) => `
  <li class="track-list-item${n === current ? ' currently-playing' : ''}">
    <button class="play-pause-button" aria-label="${n === current ? 'Pause' : 'Play'}" data-id="row-${n}"></button>
    <div class="track-meta"><a href="${FIXTURE_ORIGIN}/album/row-${n}">Row ${n}</a></div>
    <button class="wishlist-button" data-id="row-${n}-wishlist"></button>
  </li>`;

const tracklist = (current: number) => `
  <div class="player-dialog">
    <ol class="tracks">${[1, 2, 3].map((n) => row(n, current)).join('')}</ol>
  </div>`;

const slider = `
  <div class="track-progress">
    <input type="range" min="0" max="200" value="50" style="width: 400px">
  </div>`;

// The player Bandcamp shows for albums and tracks: the tracklist comes before the bar.
const TRACK_PLAYER = `
  ${tracklist(2)}
  <div class="player-bar">
    <div class="track-meta"><a href="${FIXTURE_ORIGIN}/album/current?from=homepage">Current</a></div>
    <button class="wishlist-button" data-id="bar-wishlist"></button>
    <button class="play-pause-button" aria-label="Pause" tracklistkey="aggregated:album:new_and_notable" data-id="bar-toggle"></button>
    ${slider}
    <button class="prev-track" data-id="bar-prev"></button>
    <button class="next-track" data-id="bar-next"></button>
    <button class="expand-button" data-id="expand"></button>
  </div>`;

// Radio shows are one long stream: no skip buttons, wishlist button or link in the bar.
const radioPlayer = (popup: string) => `
  ${popup}
  <div class="player-bar">
    <div class="track"><h3>Radio show</h3></div>
    <button class="play-pause-button" aria-label="Pause" tracklistkey="radio:7" data-id="bar-toggle"></button>
    ${slider}
    <button class="expand-button" data-id="expand"></button>
  </div>`;

const home = (player: string) => `
  <div id="HomepageApp">
    <div style="height: 3000px"></div>
    <ul>
      <li class="card-item">
        <button class="play-pause-button" aria-label="Play" tracklistkey="radio:6" data-id="card-6"></button>
        <div class="header"><a href="${FIXTURE_ORIGIN}/radio/show/6">Show 6</a></div>
      </li>
      <li class="card-item">
        <button class="play-pause-button" aria-label="Pause" tracklistkey="radio:7" data-id="card-7"></button>
        <div class="header"><a href="${FIXTURE_ORIGIN}/radio/show/7?from=homepage">Show 7</a></div>
      </li>
    </ul>
    <section class="floating-player has-track">${player}</section>
  </div>
  ${RECORD_CLICKS}
  <script>
    window.seeks = [];
    const slider = document.querySelector('input[type="range"]');
    // Bandcamp commits a seek when the mouse is released.
    slider.addEventListener('mouseup', () => window.seeks.push(Number(slider.value)));
  </script>`;

async function openHome(page: Page) {
  await page.goto(FIXTURE_ORIGIN);
  await waitForShortcuts(page);
  // The readiness probe is a rewind, so start each test from a clean slate.
  await resetClicks(page);
  await page.evaluate(() => {
    document.querySelector<HTMLInputElement>('input[type="range"]')!.value =
      '50';
    (window as unknown as { seeks: number[] }).seeks = [];
  });
}

test('shortcuts drive the player bar, not the open tracklist', async ({
  context,
  page,
}) => {
  await serveFixture(context, home(TRACK_PLAYER));
  await openHome(page);

  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('KeyW');
  expect(await clicks(page)).toEqual([
    'bar-toggle',
    'bar-next',
    'bar-prev',
    'bar-wishlist',
  ]);

  await page.keyboard.press('ArrowRight');
  expect(
    await page.evaluate(() => (window as unknown as { seeks: number[] }).seeks),
  ).toEqual([80]);

  await expectNewTab(
    context,
    () => page.keyboard.press('Enter'),
    `${FIXTURE_ORIGIN}/album/current?from=homepage`,
  );
});

test('keys keep scrolling the page until something is loaded in the player', async ({
  context,
  page,
}) => {
  await serveFixture(context, home(TRACK_PLAYER));
  await openHome(page);
  await page
    .locator('.floating-player')
    .evaluate((player) => player.classList.remove('has-track'));

  await page.keyboard.press('Space');
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
  await page.keyboard.press('KeyW');
  await page.keyboard.press('ArrowRight');
  expect(await clicks(page)).toEqual([]);
});

test('radio shows skip, wishlist and open through the tracklist and card', async ({
  context,
  page,
}) => {
  await serveFixture(context, home(radioPlayer(tracklist(2))));
  await openHome(page);

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('KeyW');
  expect(await clicks(page)).toEqual(['row-3', 'row-1', 'row-2-wishlist']);

  await expectNewTab(
    context,
    () => page.keyboard.press('Enter'),
    `${FIXTURE_ORIGIN}/radio/show/7?from=homepage`,
  );
});

test('radio shows expand a collapsed tracklist to skip', async ({
  context,
  page,
}) => {
  // Like Bandcamp, render the tracklist only once the player is expanded.
  const popup = `<template id="tracklist">${tracklist(2)}</template>
    <script>
      document.addEventListener('click', (event) => {
        if (!event.target.closest('.expand-button')) return;
        setTimeout(() => {
          const template = document.getElementById('tracklist');
          template.replaceWith(template.content);
        }, 50);
      });
    </script>`;
  await serveFixture(context, home(radioPlayer(popup)));
  await openHome(page);

  await page.keyboard.press('ArrowDown');
  await expect.poll(() => clicks(page)).toEqual(['expand', 'row-3']);
});

test('skipping scrolls to the card of the new track', async ({
  context,
  page,
}) => {
  // Like Bandcamp, the "Pause" label follows the player from card to card,
  // and the carousel snaps to pages of two cards.
  const carousel = `
    <ul style="display: flex; overflow-x: scroll; width: 600px; scroll-snap-type: x mandatory">
      ${[1, 2, 3, 4, 5, 6]
        .map(
          (
            n,
          ) => `<li class="card-item${n % 2 ? ' carousel-page-start' : ''}" style="flex: 0 0 280px; height: 200px; ${n % 2 ? 'scroll-snap-align: start' : ''}">
            <button class="play-pause-button" aria-label="${n === 1 ? 'Pause' : 'Play'}" data-id="album-${n}"></button>
          </li>`,
        )
        .join('')}
    </ul>
    <div style="height: 3000px"></div>
    <script>
      document.addEventListener('click', (event) => {
        const step = event.target.closest('.next-track') ? 1 : event.target.closest('.prev-track') ? -1 : 0;
        if (!step) return;
        setTimeout(() => {
          const buttons = [...document.querySelectorAll('[data-id^="album-"]')];
          const index = buttons.findIndex((b) => b.getAttribute('aria-label') === 'Pause');
          buttons[index].setAttribute('aria-label', 'Play');
          buttons[index + step].setAttribute('aria-label', 'Pause');
        }, 100);
      });
    </script>`;
  await serveFixture(context, carousel + home(TRACK_PLAYER));
  await openHome(page);
  await page.evaluate(() => window.scrollTo(0, 2000));

  for (const n of [2, 3, 4]) {
    await page.keyboard.press('ArrowDown');
    await expect(page.locator(`[data-id="album-${n}"]`)).toBeInViewport();
  }
  await expect(page.locator('[data-id="album-1"]')).not.toBeInViewport();

  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp');
  await expect(page.locator('[data-id="album-1"]')).toBeInViewport();
});
