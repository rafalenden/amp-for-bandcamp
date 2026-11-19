import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import {
  BUILDS,
  FIXTURE_ORIGIN,
  RECORD_CLICKS,
  builtFiles,
  clicks,
  fulfillAudio,
  playAudio,
  serveFixture,
  setSettings,
  waitForAudio,
  waitForShortcuts,
} from './helpers';

// Budgets sit well above today's numbers: they are there to catch a jump, such
// as a new dependency in the content script, not to track every byte.
const KB = 1024;
const SIZE_BUDGETS: [name: string, files: RegExp, bytes: number][] = [
  // Runs on every Bandcamp page (23 KB today).
  ['content script', /^content-scripts\/.*\.js$/, 40 * KB],
  ['content styles', /^content-scripts\/.*\.css$/, 4 * KB],
  // Runs in Bandcamp's own JS world on the discover page (1 KB today).
  ['page audio hook', /^audio-hook\.js$/, 4 * KB],
  ['background script', /^background\.js$/, 8 * KB],
  // Everything but the icons (340 KB today, mostly React in the popup).
  ['all code', /\.(js|css|html|json)$/, 450 * KB],
];

for (const browser of BUILDS) {
  test(`${browser} build stays within its size budgets`, () => {
    const files = builtFiles(browser);
    for (const [name, pattern, budget] of SIZE_BUDGETS) {
      const matching = files.filter(({ file }) => pattern.test(file));
      expect(matching.length, name).toBeGreaterThan(0);
      expect(
        matching.reduce((total, { size }) => total + size, 0),
        name,
      ).toBeLessThanOrEqual(budget);
    }
  });
}

const tracks = (count: number) =>
  Array.from(
    { length: count },
    (_, index) =>
      `<tr${index ? '' : ' class="current_track"'}>
        <td class="play_status" data-id="track-${index + 1}"></td>
        <td class="track-number-col">${index + 1}</td>
        <td><a href="/track/${index + 1}">Track ${index + 1}</a></td>
      </tr>`,
  ).join('');

const ALBUM = `
  <div class="inline_player">
    <a class="playbutton" data-id="play">Play</a>
    <a class="nextbutton" data-id="next">Next</a>
    <span class="time">0:00</span>
  </div>
  <div id="tralbumArt"><a><img alt="Album art"></a></div>
  <table id="track_table"><tbody>${tracks(2)}</tbody></table>
  <div class="recommendations-content">
    <div class="recommended-album">
      <a class="play-button" data-id="rec-1">Play</a>
      <a class="album-link" href="/album/rec-1">Rec 1</a>
    </div>
  </div>
  <div id="storm"></div>
  <audio preload="auto" src="/audio.wav"></audio>
  ${RECORD_CLICKS}`;

test('sets up a very long album soon after the page is parsed', async ({
  context,
  page,
}) => {
  await serveFixture(
    context,
    `<script>
      addEventListener('DOMContentLoaded', () => {
        window.parsedAt = performance.now();
        const player = document.querySelector('.inline_player');
        new MutationObserver(() => {
          if (player.classList.contains('sticky')) window.readyAt ??= performance.now();
        }).observe(player, { attributes: true });
      });
    </script>
    <div class="inline_player"><span class="time">0:00</span></div>
    <div id="tralbumArt"><img alt="Album art"></div>
    <table id="track_table"><tbody>${tracks(2000)}</tbody></table>`,
  );
  await page.goto(`${FIXTURE_ORIGIN}/album/long`);

  type Timing = { parsedAt: number; readyAt?: number };
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Timing).readyAt))
    .toBeDefined();
  const { parsedAt, readyAt } = await page.evaluate(() => {
    const { parsedAt, readyAt } = window as unknown as Timing;
    return { parsedAt, readyAt: readyAt! };
  });
  // Mostly the browser's own wait for `document_idle`; the script adds little.
  expect(readyAt - parsedAt).toBeLessThan(1500);
});

test('adds little to the cost of a page that keeps changing', async ({
  context,
  page,
}) => {
  // The same page twice: the extension only sets up where there is a player.
  await context.route(`${FIXTURE_ORIGIN}/**`, (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname.endsWith('.wav')) return fulfillAudio(route);
    return route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><meta charset="utf-8">${
        pathname === '/album/busy'
          ? ALBUM
          : ALBUM.replace('inline_player', 'some-other-player')
      }`,
    });
  });

  /** Fastest of five runs that add and remove 10,000 elements, in ms. */
  const storm = (target: Page) =>
    target.evaluate(async () => {
      const container = document.querySelector('#storm')!;
      const nextTask = () =>
        new Promise<void>((resolve) => {
          const channel = new MessageChannel();
          channel.port1.onmessage = () => resolve();
          channel.port2.postMessage(null);
        });
      const times: number[] = [];
      for (let run = 0; run < 5; run++) {
        const start = performance.now();
        for (let batch = 0; batch < 40; batch++) {
          for (let index = 0; index < 250; index++) {
            const item = document.createElement('div');
            item.className = 'collection-item';
            item.innerHTML = '<a href="/album/x"><span>Title</span></a>';
            container.append(item);
          }
          // Mutation observers, the extension's included, run before the next task.
          await nextTask();
        }
        container.replaceChildren();
        await nextTask();
        times.push(performance.now() - start);
      }
      return Math.min(...times);
    });

  await page.goto(`${FIXTURE_ORIGIN}/plain`);
  await waitForAudio(page);
  await playAudio(page, 10);
  const without = await storm(page);

  await page.goto(`${FIXTURE_ORIGIN}/album/busy`);
  await waitForShortcuts(page);
  await waitForAudio(page);
  await playAudio(page, 10);
  await expect(page.locator('.playback-progress')).toBeVisible();
  const withExtension = await storm(page);

  // Measured against the same browser on the same machine, so a slow runner
  // does not fail it. Today the album page costs a few times the bare page,
  // because it looks for new audio elements after every change; work done per
  // added element instead would cost hundreds of times more.
  expect(withExtension).toBeLessThan(without * 10 + 100);
});

test('changing settings many times leaves one auto-play timer', async ({
  context,
  page,
}) => {
  await serveFixture(context, ALBUM);
  await page.goto(`${FIXTURE_ORIGIN}/album/test`);
  await waitForShortcuts(page);
  await waitForAudio(page);
  for (let change = 0; change < 10; change++) {
    await setSettings(context, { autoPlayNext: false, volume: 40 + change });
    await setSettings(context, {
      autoPlayNext: true,
      showLeaveWarning: !change,
    });
  }
  await expect
    .poll(() =>
      page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.volume),
    )
    .toBeCloseTo(0.49);

  // The last track's final second, slowed down so it lasts a few seconds. One
  // timer asks for the next track every 700 ms; ten of them would ask ten
  // times as often.
  await page
    .locator('#track_table tr')
    .evaluateAll((rows) =>
      rows.forEach((row, index) =>
        row.classList.toggle('current_track', index === rows.length - 1),
      ),
    );
  const ending = await page
    .locator('audio')
    .evaluate((audio: HTMLAudioElement) => audio.duration - 0.95);
  await playAudio(page, ending, 0.25);
  await expect.poll(() => clicks(page)).toContain('rec-1');
  await page.waitForTimeout(1500);

  const asked = (await clicks(page)).filter((id) => id === 'rec-1').length;
  expect(asked).toBeGreaterThan(0);
  expect(asked).toBeLessThanOrEqual(4);
});

test('popup is ready to use soon after it opens', async ({ extension }) => {
  const popup = await extension.openPopup();
  await expect(popup.locator('#volumeSlider')).toBeEnabled();

  // Time since the popup started loading, including reading the settings.
  expect(await popup.evaluate(() => performance.now())).toBeLessThan(2000);
});
