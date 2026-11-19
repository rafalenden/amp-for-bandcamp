import type { AudioDownloadMessage } from '../src/types/messages';
import { test, expect, type ExtensionPage } from './fixtures';
import type { ExtensionGlobal } from './helpers';

type Exchange = {
  outcome: 'disconnected' | 'complete' | 'error' | 'no reply';
  messages: AudioDownloadMessage[];
};

/** Asks the background for `url` over a port, as the BPM analyzer frame does. */
function download(page: ExtensionPage, url: string, name = 'bpm-audio') {
  return page.evaluate(
    ([audioUrl, portName]) => {
      const { chrome } = globalThis as unknown as ExtensionGlobal;
      const port = chrome.runtime.connect({ name: portName });
      const messages: AudioDownloadMessage[] = [];
      return new Promise<Exchange>((resolve) => {
        const done = (outcome: Exchange['outcome']) => {
          port.disconnect();
          resolve({ outcome, messages });
        };
        port.onDisconnect.addListener(() => done('disconnected'));
        port.onMessage.addListener((message: AudioDownloadMessage) => {
          messages.push(message);
          if (message.type !== 'chunk') done(message.type);
        });
        setTimeout(() => done('no reply'), 3000);
        port.postMessage({ url: audioUrl });
      });
    },
    [url, name] as const,
  );
}

test.describe('background audio download', () => {
  let requests: string[];
  let analyzer: ExtensionPage;
  const audio = Buffer.from(
    Array.from({ length: 100_000 }, (_, i) => (i * 7) % 256),
  );

  test.beforeEach(async ({ extension }) => {
    requests = [];
    await extension.routeAudio((url) => {
      requests.push(url);
      return url.endsWith('/missing.mp3')
        ? { status: 404 }
        : { contentType: 'audio/mpeg', body: audio };
    });
    analyzer = await extension.openAnalyzer();
  });

  test('streams audio to the analyzer in bounded chunks', async () => {
    const { outcome, messages } = await download(
      analyzer,
      'https://t4.bcbits.com/stream/track.mp3',
    );

    expect(outcome).toBe('complete');
    const chunks = messages.flatMap((message) =>
      message.type === 'chunk' ? [Buffer.from(message.data, 'base64')] : [],
    );
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(32768);
    expect(Buffer.concat(chunks).equals(audio)).toBe(true);
    expect(requests).toEqual(['https://t4.bcbits.com/stream/track.mp3']);
  });

  test('reports HTTP errors', async () => {
    const { outcome, messages } = await download(
      analyzer,
      'https://t4.bcbits.com/stream/missing.mp3',
    );

    expect(outcome).toBe('error');
    expect(messages).toEqual([{ type: 'error', error: 'HTTP 404' }]);
  });

  for (const url of [
    'http://t4.bcbits.com/stream/track.mp3',
    'https://example.com/track.mp3',
    'https://bcbits.com.example.com/track.mp3',
    'https://user:secret@t4.bcbits.com/stream/track.mp3',
  ]) {
    test(`refuses to download ${url}`, async () => {
      const { outcome, messages } = await download(analyzer, url);

      expect(outcome).toBe('error');
      expect(messages).toEqual([{ type: 'error', error: 'Invalid audio URL' }]);
      expect(requests).toEqual([]);
    });
  }

  test('rejects malformed URLs', async () => {
    const { outcome } = await download(analyzer, 'not a url');

    expect(outcome).toBe('error');
    expect(requests).toEqual([]);
  });

  test('ignores ports with other names', async () => {
    const { outcome } = await download(
      analyzer,
      'https://t4.bcbits.com/stream/track.mp3',
      'something-else',
    );

    expect(outcome).toBe('no reply');
    expect(requests).toEqual([]);
  });
});

test('only the BPM analyzer page may request audio', async ({ extension }) => {
  const requests: string[] = [];
  await extension.routeAudio((url) => {
    requests.push(url);
    return { body: 'audio' };
  });
  const popup = await extension.openPopup();

  const { outcome, messages } = await download(
    popup,
    'https://t4.bcbits.com/stream/track.mp3',
  );
  expect(outcome).toBe('disconnected');
  expect(messages).toEqual([]);
  expect(requests).toEqual([]);
});
