import { browser } from 'wxt/browser';
import { wrap } from 'web-audio-beat-detector-broker';
import type { AudioDownloadMessage } from '../../types/messages';

const params = new URLSearchParams(location.hash.slice(1));
const requestId = params.get('requestId');
const parentOrigin = params.get('parentOrigin');

async function analyze() {
  const port = browser.runtime.connect({ name: 'bpm-audio' });
  let worker: Worker | undefined;
  let cancelled = false;
  const dispose = () => {
    cancelled = true;
    port.disconnect();
    worker?.terminate();
  };
  window.addEventListener('pagehide', dispose, { once: true });
  try {
    const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      port.onDisconnect.addListener(() =>
        reject(
          new Error(
            browser.runtime.lastError?.message ?? 'Audio download disconnected',
          ),
        ),
      );
      port.onMessage.addListener((message: AudioDownloadMessage) => {
        if (message.type === 'error') reject(new Error(message.error));
        else if (message.type === 'complete')
          resolve(new Blob(chunks).arrayBuffer());
        else
          chunks.push(
            Uint8Array.from(atob(message.data), (char) => char.charCodeAt(0)),
          );
      });
      port.postMessage({ url: params.get('url') });
    });
    port.disconnect();
    // Offline decoding needs no audio output or user gesture.
    const audio = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(
      bytes,
    );
    if (cancelled) return;
    worker = new Worker(
      new URL('../../bpm/detector.worker.ts', import.meta.url),
    );
    const failure = new Promise<never>((_, reject) => {
      worker!.onerror = worker!.onmessageerror = () =>
        reject(new Error('BPM worker failed'));
    });
    const { bpm } = await Promise.race([wrap(worker).guess(audio), failure]);
    return { bpm: Math.round(bpm) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  } finally {
    window.removeEventListener('pagehide', dispose);
    dispose();
  }
}

if (
  requestId &&
  parentOrigin &&
  /^https?:\/\/([\w-]+\.)?bandcamp\.com$/.test(parentOrigin) &&
  window.parent !== window
) {
  void analyze().then((result) => {
    if (result)
      window.parent.postMessage(
        { type: 'bpm-result', requestId, ...result },
        parentOrigin,
      );
  });
}
