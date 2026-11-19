import type { BrowserContext, Page } from '@playwright/test';
import { test, expect } from './fixtures';
import {
  BUILDS,
  FIXTURE_ORIGIN,
  beatWav,
  builtFiles,
  serveFixture,
  waitForShortcuts,
} from './helpers';

const BANDCAMP = ['*://*.bandcamp.com/*'];
// Hosts that shipped code may name: XML namespaces and React's error links.
const KNOWN_HOSTS = ['www.w3.org', 'react.dev'];

for (const browser of BUILDS) {
  test.describe(`${browser} build`, () => {
    test('asks only for storage and the Bandcamp hosts', () => {
      const manifest = JSON.parse(
        builtFiles(browser)
          .find(({ file }) => file === 'manifest.json')!
          .read(),
      );

      expect(manifest.permissions).toEqual(['storage']);
      expect(manifest.host_permissions).toEqual([
        '*://*.bcbits.com/*',
        ...BANDCAMP,
      ]);
      expect(manifest.optional_permissions).toBeUndefined();
      expect(manifest.optional_host_permissions).toBeUndefined();
      for (const script of manifest.content_scripts) {
        expect(script.matches).toEqual(BANDCAMP);
      }
      // Only Bandcamp pages may load extension files, and only these two.
      expect(manifest.web_accessible_resources).toEqual([
        {
          resources: ['bpm-analyzer.html', 'audio-hook.js'],
          matches: BANDCAMP,
        },
      ]);
      // No other site or extension may message the background script, and the
      // browser's default content security policy stays in force.
      expect(manifest.externally_connectable).toBeUndefined();
      expect(manifest.content_security_policy).toBeUndefined();
    });

    test('ships no remote or dynamically built code', () => {
      const files = builtFiles(browser);
      const scripts = files.filter(({ file }) => file.endsWith('.js'));
      const pages = files.filter(({ file }) => file.endsWith('.html'));
      expect(scripts.length).toBeGreaterThan(0);
      expect(pages.length).toBeGreaterThan(0);

      for (const { file, read } of scripts) {
        const code = read();
        expect(code, file).not.toMatch(/\beval\s*\(|\bnew Function\s*\(/);
        const hosts = [...code.matchAll(/https?:\/\/([\w.-]+)/g)].map(
          ([, host]) => host,
        );
        expect(KNOWN_HOSTS, file).toEqual(expect.arrayContaining(hosts));
      }
      for (const { file, read } of pages) {
        const html = read();
        // Every script is a file of the extension's own: none inline, none remote.
        for (const [tag] of html.matchAll(/<script\b[^>]*>/g)) {
          expect(tag, file).toMatch(/\ssrc="\/[^/]/);
        }
        expect(html, file).not.toMatch(/\son\w+\s*=/);
        expect(html, file).not.toMatch(/(src|href)="(https?:)?\/\//);
      }
    });
  });
}

// One playable track, and a record of every message the page receives.
const tralbum = (url: string) =>
  JSON.stringify({ trackinfo: [{ track_num: 1, file: { 'mp3-128': url } }] });
const album = (trackUrl: string, design = '{}') => `
  <style id="custom-design-rules-style" data-design='${design}'></style>
  <div data-tralbum='${tralbum(trackUrl)}'></div>
  <div class="inline_player"><span class="time">0:00</span></div>
  <script>
    window.received = [];
    addEventListener('message', (event) =>
      window.received.push({
        fromPage: event.origin === location.origin,
        data: event.data,
      }),
    );
  </script>`;

type Received = { fromPage: boolean; data: unknown };
const received = (page: Page) =>
  page.evaluate(() => (window as unknown as { received: Received[] }).received);

/** Records requests to `origin` and answers them with an empty page. */
async function watch(context: BrowserContext, origin: string) {
  const requests: string[] = [];
  await context.route(`${origin}/**`, (route) => {
    requests.push(route.request().url());
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html>' });
  });
  return requests;
}

test.describe('BPM analysis', () => {
  test('ignores a result forged by the page, and gives the page only the BPM', async ({
    context,
    page,
    extension,
  }) => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await extension.routeAudio(async () => {
      await held;
      return { contentType: 'audio/wav', body: beatWav(120, 15) };
    });
    await serveFixture(context, album('https://t4.bcbits.com/stream/one.wav'));
    await page.goto(`${FIXTURE_ORIGIN}/album/test`);

    // The page can read the request id from the analyzer frame it hosts, but
    // a result only counts when it comes from the extension's own origin.
    await expect(page.locator('iframe')).toHaveCount(1);
    await page.evaluate(() => {
      const hash = new URL(document.querySelector('iframe')!.src).hash;
      const requestId = new URLSearchParams(hash.slice(1)).get('requestId');
      window.postMessage({ type: 'bpm-result', requestId, bpm: 666 }, '*');
    });
    await expect
      .poll(() => received(page))
      .toContainEqual({
        fromPage: true,
        data: { type: 'bpm-result', requestId: expect.any(String), bpm: 666 },
      });
    await expect(page.locator('.bpm-display')).toBeEmpty();

    release();
    await expect(page.locator('.bpm-display')).toHaveText(' | 120 BPM', {
      timeout: 20000,
    });
    // No audio data crosses into the page: one small message, and that is all.
    expect((await received(page)).filter(({ fromPage }) => !fromPage)).toEqual([
      {
        fromPage: false,
        data: { type: 'bpm-result', requestId: expect.any(String), bpm: 120 },
      },
    ]);
  });

  test('never downloads a track URL that only mentions bcbits.com', async ({
    context,
    page,
    extension,
  }) => {
    const audioRequests: string[] = [];
    await extension.routeAudio((url) => {
      audioRequests.push(url);
      return { contentType: 'audio/wav', body: beatWav(120, 15) };
    });
    const otherRequests = await watch(context, 'https://evil.example');
    const failure = page.waitForEvent('console', (message) =>
      message.text().includes('BPM analysis error'),
    );
    await serveFixture(
      context,
      album('https://evil.example/track.wav?https://t4.bcbits.com/'),
    );
    await page.goto(`${FIXTURE_ORIGIN}/album/test`);

    await failure;
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(page.locator('.bpm-display')).toBeEmpty();
    expect(audioRequests).toEqual([]);
    expect(otherRequests).toEqual([]);
  });

  for (const origin of [
    'https://evil.example',
    'https://bandcamp.com.evil.example',
  ]) {
    test(`gives ${origin} neither audio nor a result`, async ({
      context,
      page,
      extension,
    }) => {
      const audioRequests: string[] = [];
      await extension.routeAudio((url) => {
        audioRequests.push(url);
        return { contentType: 'audio/wav', body: beatWav(120, 15) };
      });
      const analyzer = (await extension.openAnalyzer()).url().split('#')[0];
      await watch(context, origin);
      await page.goto(`${origin}/`);

      const messages = await page.evaluate(
        (src) =>
          new Promise<unknown[]>((resolve) => {
            const seen: unknown[] = [];
            addEventListener('message', (event) => seen.push(event.data));
            const frame = document.createElement('iframe');
            frame.src = src;
            document.body.append(frame);
            setTimeout(() => resolve(seen), 2000);
          }),
        `${analyzer}#${new URLSearchParams({
          url: 'https://t4.bcbits.com/stream/track.wav',
          requestId: 'stolen',
          parentOrigin: origin,
        })}`,
      );

      expect(messages).toEqual([]);
      expect(audioRequests).toEqual([]);
    });
  }
});

test('page styling data cannot add its own CSS to the player', async ({
  context,
  page,
}) => {
  const requests = await watch(context, 'https://evil.example');
  await serveFixture(
    context,
    album(
      'https://t4.bcbits.com/stream/one.wav',
      JSON.stringify({
        body_color:
          '112233; background-image: url(https://evil.example/pixel.png)',
      }),
    ),
  );
  await page.goto(`${FIXTURE_ORIGIN}/album/test`);

  const player = page.locator('.inline_player');
  await expect(player).toHaveClass(/sticky/);
  expect((await player.getAttribute('style')) ?? '').not.toContain('url(');
  expect(requests).toEqual([]);
});

test.describe('page audio hook', () => {
  // Like Bandcamp's discover page, the audio element is never attached to the DOM.
  const DISCOVER = `
    <div id="DiscoverApp">
      <div class="floating-player">
        <button class="play-pause-button" aria-label="Play"></button>
        <div class="track-progress"><input type="range" min="0" max="90" value="0"></div>
      </div>
    </div>
    <script>
      window.player = new Audio('/audio.wav');
      document.querySelector('.play-pause-button').onclick = () => window.player.play();
    </script>`;

  type Fixture = { player: HTMLAudioElement };
  const time = (page: Page) =>
    page.evaluate(() => (window as unknown as Fixture).player.currentTime);
  const volume = (page: Page) =>
    page.evaluate(() => (window as unknown as Fixture).player.volume);
  const post = (page: Page, message: object) =>
    page.evaluate((data) => window.postMessage(data, location.origin), message);

  test.beforeEach(async ({ context, page }) => {
    await serveFixture(context, DISCOVER);
    await page.goto(`${FIXTURE_ORIGIN}/discover`);
    await waitForShortcuts(page);
    await page.locator('.play-pause-button').click();
    await expect(page.locator('html')).toHaveAttribute(
      'data-amp-audio-hook',
      '1',
    );
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as Fixture).player.duration),
      )
      .toBeGreaterThan(0);
    // Paused, so the position only moves when a message moves it.
    await page.evaluate(() => {
      const { player } = window as unknown as Fixture;
      player.pause();
      player.currentTime = 10;
    });
  });

  test('takes seek requests only from the page itself, and only numbers', async ({
    page,
  }) => {
    const seek = { source: 'amp-for-bandcamp', type: 'seek' };
    // A frame embedded in the page, such as an ad, sends the same message.
    await page.evaluate(
      (message) => {
        const frame = document.createElement('iframe');
        frame.srcdoc = `<script>parent.postMessage(${JSON.stringify(message)}, '*')</script>`;
        document.body.append(frame);
      },
      { ...seek, delta: 30 },
    );
    await post(page, { ...seek, delta: '30' });
    await post(page, { ...seek, source: 'someone-else', delta: 30 });
    await post(page, { ...seek, type: 'volume', delta: 30 });
    // Messages arrive in order, so this one landing means the others were read.
    await post(page, { ...seek, delta: 5 });

    await expect.poll(() => time(page)).toBeCloseTo(15, 1);
  });

  test('keeps seeks and volume within the track and the 0 to 1 range', async ({
    page,
  }) => {
    const seek = { source: 'amp-for-bandcamp', type: 'seek' };
    await post(page, { ...seek, delta: 1e9 });
    await expect.poll(() => time(page)).toBeCloseTo(90, 0);
    await post(page, { ...seek, delta: -1e9 });
    await expect.poll(() => time(page)).toBe(0);
    await post(page, { ...seek, delta: Number.NaN });
    await post(page, { ...seek, delta: 5 });
    await expect.poll(() => time(page)).toBeCloseTo(5, 1);

    const setVolume = (value: string) =>
      page.evaluate((raw) => {
        document.documentElement.dataset.ampVolume = raw;
      }, value);
    await setVolume('900');
    await expect.poll(() => volume(page)).toBe(1);
    await setVolume('-40');
    await expect.poll(() => volume(page)).toBe(0);
    await setVolume('50');
    await expect.poll(() => volume(page)).toBe(0.5);
    await setVolume('loud');
    await page.waitForTimeout(200);
    expect(await volume(page)).toBe(0.5);
  });
});
