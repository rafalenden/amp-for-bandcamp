import type { BrowserContext, Page } from '@playwright/test';
import { test, expect } from './fixtures';

function beatWav(bpm: number, seconds = 60) {
  const rate = 44100;
  const samples = rate * seconds;
  const wav = Buffer.alloc(44 + samples * 4);
  wav.write('RIFF');
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 4, 28);
  wav.writeUInt16LE(4, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(samples * 4, 40);
  for (let i = 0; i < samples; i++) {
    const t = (i / rate) % (60 / bpm);
    const sample = Math.round(
      30000 * Math.sin(2 * Math.PI * 80 * t) * Math.exp(-t * 30),
    );
    wav.writeInt16LE(sample, 44 + i * 4);
    wav.writeInt16LE(sample, 46 + i * 4);
  }
  return wav;
}

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
}) => {
  const wav = beatWav(120, 180); // 32 MB, large enough to expose the old JSON audio transfer.
  let requests = 0;
  await context.route('https://audio.bcbits.com/**', (route) => {
    expect(route.request().serviceWorker()).not.toBeNull();
    requests++;
    return route.fulfill({ contentType: 'audio/wav', body: wav });
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
  extensionId,
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
  await context.route('https://audio.bcbits.com/one.wav', async (route) => {
    requested();
    await held;
    await route
      .fulfill({ contentType: 'audio/wav', body: firstTrack })
      .catch(() => {});
  });
  await context.route('https://audio.bcbits.com/two.wav', (route) =>
    route.fulfill({ contentType: 'audio/wav', body: wav }),
  );
  await album(context, page);
  await started;
  await selectTrack(page, 2);
  await expect(page.locator('.bpm-display')).toHaveText(' | 150 BPM');
  await selectTrack(page, 1);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
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
}) => {
  await context.route('https://audio.bcbits.com/one.wav', (route) =>
    route.fulfill({ body: 'not audio' }),
  );
  await context.route('https://audio.bcbits.com/two.wav', (route) =>
    route.fulfill({ contentType: 'audio/wav', body: beatWav(120, 15) }),
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
