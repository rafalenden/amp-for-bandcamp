import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import type { FetchRequest, FetchResponse } from '../types/messages';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener(
    (message: FetchRequest, _sender, sendResponse) => {
      if (message.type !== 'fetch') return;
      const respond = (response: FetchResponse) => sendResponse(response);
      fetch(message.url)
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.arrayBuffer();
        })
        .then((buffer) => respond({ data: Array.from(new Uint8Array(buffer)) }))
        .catch((error: unknown) =>
          respond({
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      return true;
    },
  );
});
