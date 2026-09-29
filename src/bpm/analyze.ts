import { browser } from 'wxt/browser';
import type { BpmResult } from '../types/messages';

// Only the result reaches the album; audio stays in the extension contexts.
export async function analyzeBpm(
  url: string,
  signal: AbortSignal,
): Promise<number> {
  const frame = document.createElement('iframe');
  const requestId = crypto.randomUUID();
  const analyzerUrl = new URL(browser.runtime.getURL('/bpm-analyzer.html'));
  const origin = `${analyzerUrl.protocol}//${analyzerUrl.host}`.toLowerCase();
  frame.hidden = true;
  frame.src = `${analyzerUrl.href}#${new URLSearchParams({ url, requestId, parentOrigin: location.origin })}`;

  let onResult: (event: MessageEvent<BpmResult>) => void;
  let onAbort: () => void;
  let timeout: ReturnType<typeof setTimeout>;
  try {
    return await new Promise<number>((resolve, reject) => {
      onAbort = () =>
        reject(new DOMException('BPM analysis cancelled', 'AbortError'));
      onResult = ({ origin: senderOrigin, source, data }) => {
        // Firefox may report a null source for privileged messages.
        if (
          senderOrigin.toLowerCase() !== origin ||
          (source !== null && source !== frame.contentWindow) ||
          data?.requestId !== requestId ||
          data.type !== 'bpm-result'
        )
          return;
        if ('error' in data) reject(new Error(data.error));
        else if (Number.isFinite(data.bpm) && data.bpm > 0) resolve(data.bpm);
        else reject(new Error('Invalid BPM result'));
      };
      timeout = setTimeout(
        () => reject(new Error('BPM analysis timed out')),
        120_000,
      );
      window.addEventListener('message', onResult);
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) return onAbort();
      frame.onerror = () => reject(new Error('Unable to load BPM analyzer'));
      document.body.appendChild(frame);
    });
  } finally {
    clearTimeout(timeout!);
    window.removeEventListener('message', onResult!);
    signal.removeEventListener('abort', onAbort!);
    frame.remove();
  }
}
