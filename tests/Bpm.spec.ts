import type { BrowserContext, Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { beatWav } from './helpers';

async function album(context: BrowserContext, page: Page) {
  // Safari rejects cross-origin fetches in embedded extension pages even when
  // the background has host permissions. Keep this restriction in Chromium CI.
  await page.addInitScript(() => {
    if (window === window.top) return;
    window.fetch = () =>
      Promise.reject(
        new TypeError('Cross-origin fetch blocked in extension iframe'),
      );
  });
  const tralbum = JSON.stringify({
    trackinfo: [
      { track_num: 1, file: { 'mp3-128': 'https://audio.bcbits.com/one.wav' } },
      { track_num: 2, file: { 'mp3-128': 'https://audio.bcbits.com/two.wav' } },
      { track_num: 3 },
    ],
  });
  await context.route('https://amp-test.bandcamp.com/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      // The page forbids workers; the extension frame uses its own strict CSP.
      headers: { 'Content-Security-Policy': "worker-src 'none'" },
      body: `<!doctype html><div data-tralbum='${tralbum}'></div>
      <div class="inline_player"><span class="time">0:00</span></div>
      <input aria-label="Search"><audio></audio>
      <table id="track_table"><tbody>
        <tr class="current_track"><td class="track-number-col">1</td></tr>
        <tr><td class="track-number-col">2</td></tr>
        <tr><td class="track-number-col">3</td></tr>
      </tbody></table>`,
    }),
  );
  await page.goto('https://amp-test.bandcamp.com/album/test');
}

async function selectTrack(page: Page, number: number) {
  await page.locator('#track_table tr').evaluateAll((rows, current) => {
    rows.forEach((row, index) =>
      row.classList.toggle('current_track', index + 1 === current),
    );
  }, number);
}

test('detects in a packaged worker without blocking the album, and caches results', async ({
  context,
  page,
  extension,
}) => {
  const wav = beatWav(120, 180); // 32 MB, large enough to expose the old JSON audio transfer.
  let requests = 0;
  await extension.routeAudio(() => {
    requests++;
    return { contentType: 'audio/wav', body: wav };
  });
  const workers: string[] = [];
  page.on('worker', (worker) => workers.push(worker.url()));
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const durations: number[] = [];
    Object.assign(window, { bpmLongTasks: durations });
    new PerformanceObserver((list) =>
      durations.push(...list.getEntries().map((entry) => entry.duration)),
    ).observe({ type: 'longtask', buffered: true });
  });
  await album(context, page);
  await page.getByRole('textbox').fill('still responsive');
  await expect(page.locator('.bpm-display')).toHaveText(' | 120 BPM', {
    timeout: 20000,
  });
  expect(workers.some((url) => url.includes('detector.worker-'))).toBe(true);
  expect(
    await page.evaluate(() =>
      Math.max(
        0,
        ...(window as unknown as { bpmLongTasks: number[] }).bpmLongTasks,
      ),
    ),
  ).toBeLessThan(500);
  await expect(page.locator('iframe')).toHaveCount(0);
  await selectTrack(page, 3);
  await expect(page.locator('.bpm-display')).toBeEmpty();
  await selectTrack(page, 1);
  await expect(page.locator('.bpm-display')).toHaveText(' | 120 BPM');
  expect(requests).toBe(1);
});

test('cancels old tracks and settings changes without restoring stale BPM', async ({
  context,
  page,
  extension,
}) => {
  const wav = beatWav(150, 15);
  const firstTrack = beatWav(120, 15);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested!: () => void;
  const started = new Promise<void>((resolve) => {
    requested = resolve;
  });
  await extension.routeAudio(async (url) => {
    if (url.endsWith('/two.wav'))
      return { contentType: 'audio/wav', body: wav };
    requested();
    await held;
    return { contentType: 'audio/wav', body: firstTrack };
  });
  await album(context, page);
  await started;
  await selectTrack(page, 2);
  await expect(page.locator('.bpm-display')).toHaveText(' | 150 BPM');
  await selectTrack(page, 1);
  const popup = await extension.openPopup();
  const setting = popup.getByRole('checkbox', {
    name: 'Show BPM on album pages',
  });
  await setting.uncheck();
  await expect(page.locator('iframe')).toHaveCount(0);
  release();
  await expect(page.locator('.bpm-display')).toBeEmpty();
  await setting.check();
  await expect(page.locator('.bpm-display')).toHaveText(' | 120 BPM');
  await setting.uncheck();
  await expect(page.locator('.bpm-display')).toBeEmpty();
  await selectTrack(page, 2);
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('cleans up failed audio analysis and can analyze the next track', async ({
  context,
  page,
  extension,
}) => {
  await extension.routeAudio((url) =>
    url.endsWith('/two.wav')
      ? { contentType: 'audio/wav', body: beatWav(120, 15) }
      : { body: 'not audio' },
  );
  const failure = page.waitForEvent('console', (message) =>
    message.text().includes('BPM analysis error'),
  );
  await album(context, page);
  await failure;
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.locator('.bpm-display')).toBeEmpty();
  await selectTrack(page, 2);
  await expect(page.locator('.bpm-display')).toHaveText(' | 120 BPM');
});
