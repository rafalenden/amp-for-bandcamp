import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { DEFAULT_SETTINGS, type Settings } from '../constants';
import type { AudioDownloadMessage } from '../types/messages';

const ICON_SIZES = [16, 32, 48, 64, 128] as const;

function iconPaths(silent: boolean) {
  const name = silent ? 'icon-muted' : 'icon';
  return Object.fromEntries(
    ICON_SIZES.map((size) => [String(size), `icons/${name}${size}.png`]),
  );
}

/** Shows the muted toolbar icon while muted or while the volume is at 0. */
async function updateActionIcon() {
  try {
    const { volume, muted } = (await browser.storage.sync.get(
      DEFAULT_SETTINGS,
    )) as Settings;
    await browser.action?.setIcon({ path: iconPaths(muted || volume === 0) });
  } catch (error) {
    console.error('[amp-for-bandcamp] Error updating action icon:', error);
  }
}

export default defineBackground(() => {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && ('muted' in changes || 'volume' in changes)) {
      void updateActionIcon();
    }
  });
  // Runs on every start of the (non-persistent) background, so the icon is
  // correct after install, browser launch, and sync from another device.
  void updateActionIcon();

  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== 'bpm-audio') return;
    // Safari can lowercase the extension UUID in sender.url.
    if (
      port.sender?.url?.split('#')[0]?.toLowerCase() !==
      browser.runtime.getURL('/bpm-analyzer.html').toLowerCase()
    ) {
      port.disconnect();
      return;
    }

    const controller = new AbortController();
    port.onDisconnect.addListener(() => controller.abort());
    const send = (message: AudioDownloadMessage) => port.postMessage(message);
    const start = async (message: { url: string }) => {
      port.onMessage.removeListener(start);
      try {
        const url = new URL(message.url);
        if (
          url.protocol !== 'https:' ||
          !url.hostname.endsWith('.bcbits.com') ||
          url.username ||
          url.password
        ) {
          throw new Error('Invalid audio URL');
        }
        // Safari applies CORS to embedded extension pages. Downloads must run
        // here, where the extension's host permissions apply.
        const response = await fetch(url, {
          signal: controller.signal,
          credentials: 'omit',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (!response.body) throw new Error('Empty audio response');
        const reader = response.body.getReader();
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            // Bounded JSON-compatible messages work in all three browsers.
            // They go only to the analyzer, never to the album's content script.
            for (let offset = 0; offset < value.length; offset += 32768) {
              send({
                type: 'chunk',
                data: btoa(
                  String.fromCharCode(
                    ...value.subarray(offset, offset + 32768),
                  ),
                ),
              });
            }
          }
        } finally {
          reader.releaseLock();
        }
        send({ type: 'complete' });
      } catch (error) {
        if (!controller.signal.aborted) {
          send({
            type: 'error',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    };
    port.onMessage.addListener(start);
  });
});
