import type { Page } from '@playwright/test';
import { test, expect, type ExtensionPage } from './fixtures';
import {
  FIXTURE_ORIGIN,
  audioState,
  serveFixture,
  setSettings,
  waitForShortcuts,
  type ExtensionGlobal,
} from './helpers';

/** The keyboard of the tab showing an extension page. */
const keyboardOf = (popup: ExtensionPage) =>
  ('keyboard' in popup ? popup : popup.page()).keyboard;

test('mute button silences playback and restores the previous volume', async ({
  extension,
}) => {
  const popup = await extension.openPopup();
  const slider = popup.getByRole('slider', { name: 'Track volume' });
  const value = popup.locator('#volumeValue');
  await expect(slider).toBeEnabled();

  await slider.fill('42');
  await expect(value).toHaveText('42%');

  await popup.getByRole('button', { name: 'Mute' }).click();
  await expect(popup.getByRole('button', { name: 'Unmute' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(slider).toHaveValue('0');
  await expect(value).toHaveText('0%');

  // The muted state and the remembered volume both survive reopening.
  const reopened = await extension.openPopup();
  await expect(reopened.locator('#volumeSlider')).toHaveValue('0');
  await reopened.getByRole('button', { name: 'Unmute' }).click();
  await expect(reopened.locator('#volumeSlider')).toHaveValue('42');
  await expect(reopened.locator('#volumeValue')).toHaveText('42%');
  await expect(slider).toHaveValue('42');

  // Moving the slider while muted unmutes at the new volume.
  await reopened.getByRole('button', { name: 'Mute' }).click();
  await expect(reopened.locator('#volumeSlider')).toHaveValue('0');
  await reopened.getByRole('slider', { name: 'Track volume' }).fill('70');
  await expect(reopened.getByRole('button', { name: 'Mute' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(reopened.locator('#volumeValue')).toHaveText('70%');
  await expect(reopened.getByRole('alert')).toHaveCount(0);
});

test('nothing is focused when the popup opens', async ({
  extension,
  browserName,
}) => {
  const popup = await extension.openPopup();
  const keyboard = keyboardOf(popup);
  await expect(popup.locator('#volumeSlider')).toBeEnabled();
  const focused = () => popup.evaluate(() => document.activeElement?.id ?? '');
  // The browser's automatic focus arrives shortly after load.
  await popup.evaluate(() => document.getElementById('muteButton')?.focus());
  expect(await focused()).toBe('');

  // Once the user presses a key, focus behaves normally. In Chromium and
  // Firefox, Tab continues from where the dropped focus was, so it lands on
  // the next control. WebKit starts again from the top of the popup.
  await keyboard.press('Tab');
  if (browserName === 'webkit') {
    await expect.poll(focused).toBe('muteButton');
    await keyboard.press('Tab');
    await expect.poll(focused).toBe('volumeSlider');
  } else {
    await expect.poll(focused).toBe('volumeSlider');
    await keyboard.press('Shift+Tab');
    await expect.poll(focused).toBe('muteButton');
  }
});

test('the toolbar icon shows when sound is off', async ({
  context,
  extension,
  browserName,
}) => {
  // Only Chromium gives the tests a handle on the background script.
  test.skip(browserName !== 'chromium', 'Needs the background service worker');
  const popup = await extension.openPopup();
  await expect(popup.locator('#volumeSlider')).toBeEnabled();

  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker'));
  // There is no API to read the current action icon, so record what the
  // background passes to setIcon.
  await worker.evaluate(() => {
    const g = globalThis as any;
    for (const action of new Set([g.chrome?.action, g.browser?.action])) {
      if (!action) continue;
      const original = action.setIcon.bind(action);
      action.setIcon = (details: any) => {
        g.__lastIcon = String(details.path?.['32']);
        return original(details);
      };
    }
  });
  const iconPath = () =>
    worker.evaluate(() => (globalThis as any).__lastIcon ?? null);

  await popup.getByRole('button', { name: 'Mute' }).click();
  await expect.poll(iconPath).toBe('icons/icon-muted32.png');
  await popup.getByRole('button', { name: 'Unmute' }).click();
  await expect.poll(iconPath).toBe('icons/icon32.png');

  // Dragging the slider to 0 also shows the muted icon without toggling mute.
  await popup.getByRole('slider', { name: 'Track volume' }).fill('0');
  await expect.poll(iconPath).toBe('icons/icon-muted32.png');
  await expect(popup.getByRole('button', { name: 'Mute' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

// Pages that play through an <audio> element in the DOM.
const DOM_AUDIO_PAGES = {
  album: [
    '/album/test',
    `<div class="inline_player"><button class="playbutton">Play</button></div>
     <div id="tralbumArt"><img alt="Album art"></div>`,
  ],
  collection: [
    '/fan',
    `<div class="collection-container"><ol class="collection-grid"></ol></div>
     <div class="carousel-player"></div>`,
  ],
  feed: ['/feed', `<div id="stories"><ul></ul></div>`],
} as const;

for (const [name, [path, body]] of Object.entries(DOM_AUDIO_PAGES)) {
  test(`mute silences the ${name} page and restores its volume`, async ({
    context,
    page,
  }) => {
    await setSettings(context, { volume: 35 });
    await serveFixture(
      context,
      `${body}<audio preload="auto" src="/audio.wav"></audio>`,
    );
    await page.goto(`${FIXTURE_ORIGIN}${path}`);
    await waitForShortcuts(page);
    const volume = async () => (await audioState(page)).volume;
    await expect.poll(volume).toBe(0.35);

    await setSettings(context, { muted: true });
    await expect.poll(volume).toBe(0);
    // Changing the volume while muted must not make the page audible.
    await setSettings(context, { volume: 60 });
    await page.waitForTimeout(200);
    expect(await volume()).toBe(0);

    await setSettings(context, { muted: false });
    await expect.poll(volume).toBe(0.6);
  });
}

// The player at the bottom of the feed and collection pages owns the volume:
// its slider sets the audio volume on a click and again whenever a track
// starts. Like Bandcamp's, it measures the click a pixel off the bar's edge.
const CAROUSEL_PLAYER = `
  <div class="carousel-player" style="position: fixed; bottom: 0; left: 100px">
    <div class="vol">
      <div class="vol-slider" style="position: relative; width: 60px; height: 10px">
        <div class="vol-amt" style="width: 100%; height: 10px"></div>
      </div>
    </div>
  </div>
  <audio preload="auto" src="/audio.wav"></audio>
  <script>
    const audio = document.querySelector('audio');
    const slider = document.querySelector('.vol-slider');
    let volume = 1;
    slider.addEventListener('click', (event) => {
      const rect = slider.getBoundingClientRect();
      volume = Math.min(1, Math.max(0, (event.clientX - rect.left - 1) / rect.width));
      document.querySelector('.vol-amt').style.width = volume * 100 + '%';
      audio.volume = volume;
    });
    audio.addEventListener('play', () => { audio.volume = volume; });
  </script>`;

/** Reads the saved volume from an open popup, which every browser has. */
const storedVolume = (popup: ExtensionPage) =>
  popup.evaluate(() =>
    (globalThis as unknown as ExtensionGlobal).chrome.storage.sync.get([
      'volume',
      'muted',
    ]),
  );

for (const [name, path, body] of [
  ['feed', '/feed', '<div id="stories"><ul></ul></div>'],
  ['collection', '/fan', '<div class="collection-container"></div>'],
] as const) {
  test(`the ${name} page's own volume slider follows the extension`, async ({
    context,
    extension,
    page,
  }) => {
    await setSettings(context, { volume: 35 });
    await serveFixture(context, `${body}${CAROUSEL_PLAYER}`);
    await page.goto(`${FIXTURE_ORIGIN}${path}`);
    await waitForShortcuts(page);
    const volume = async () => (await audioState(page)).volume;
    const bar = () =>
      page
        .locator('.vol-amt')
        .evaluate((el: HTMLElement) => Math.round(parseFloat(el.style.width)));

    await expect.poll(bar).toBe(35);
    await expect.poll(volume).toBe(0.35);

    // Starting a track makes the player apply its own volume again.
    await page.locator('audio').evaluate((a: HTMLAudioElement) => a.play());
    await expect.poll(volume).toBe(0.35);

    await setSettings(context, { muted: true });
    await expect.poll(bar).toBe(0);
    await expect.poll(volume).toBe(0);
    await setSettings(context, { muted: false });
    await expect.poll(bar).toBe(35);
    await expect.poll(volume).toBe(0.35);

    // The visitor moving the page's slider updates the extension's volume.
    await page.locator('.vol-slider').click({ position: { x: 49, y: 5 } });
    const popup = await extension.openPopup();
    await expect
      .poll(() => storedVolume(popup))
      .toEqual({ volume: 80, muted: false });
    await expect.poll(volume).toBe(0.8);
  });
}

test('a page opened while muted starts silent', async ({ context, page }) => {
  await setSettings(context, { volume: 80, muted: true });
  await serveFixture(
    context,
    `${DOM_AUDIO_PAGES.album[1]}<audio preload="auto" src="/audio.wav"></audio>`,
  );
  await page.goto(`${FIXTURE_ORIGIN}/album/test`);
  await waitForShortcuts(page);
  await expect.poll(async () => (await audioState(page)).volume).toBe(0);
  await setSettings(context, { muted: false });
  await expect.poll(async () => (await audioState(page)).volume).toBe(0.8);
});

// The homepage and /discover play through an Audio object outside the DOM.
const floatingPlayer = (appId: string) => `
  <div id="${appId}">
    <div class="floating-player has-track">
      <div class="player-bar">
        <button class="play-pause-button" aria-label="Play"></button>
      </div>
    </div>
  </div>
  <script>
    window.player = new Audio('/audio.wav');
    document.querySelector('.play-pause-button').onclick = () => window.player.play();
  </script>`;

const detachedVolume = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { player: HTMLAudioElement }).player.volume,
  );

for (const [name, path, appId] of [
  ['homepage', '/', 'HomepageApp'],
  ['discover page', '/discover', 'DiscoverApp'],
] as const) {
  test(`mute silences the ${name} and restores its volume`, async ({
    context,
    page,
  }) => {
    await setSettings(context, { volume: 35 });
    await serveFixture(context, floatingPlayer(appId));
    await page.goto(`${FIXTURE_ORIGIN}${path}`);
    await waitForShortcuts(page);
    await page.locator('.play-pause-button').click();
    await expect(page.locator('html')).toHaveAttribute(
      'data-amp-audio-hook',
      '1',
    );
    await expect.poll(() => detachedVolume(page)).toBe(0.35);

    await setSettings(context, { muted: true });
    await expect.poll(() => detachedVolume(page)).toBe(0);
    await setSettings(context, { muted: false });
    await expect.poll(() => detachedVolume(page)).toBe(0.35);
  });
}

test('mute silences a live stream and restores its volume', async ({
  context,
  extension,
  page,
}) => {
  await setSettings(context, { volume: 40 });
  await serveFixture(
    context,
    `<input class="volume-control" type="range" min="0" max="100" value="100" aria-label="Volume">`,
  );
  await page.goto(`${FIXTURE_ORIGIN}/live/test`);
  await waitForShortcuts(page);
  const slider = page.getByRole('slider', { name: 'Volume' });
  await expect(slider).toHaveValue('40');

  await setSettings(context, { muted: true });
  await expect(slider).toHaveValue('0');
  await setSettings(context, { muted: false });
  await expect(slider).toHaveValue('40');

  // The visitor moving the stream's slider updates the extension's volume.
  await slider.focus();
  await page.keyboard.press('End');
  const popup = await extension.openPopup();
  await expect
    .poll(() => storedVolume(popup))
    .toEqual({ volume: 100, muted: false });
});
