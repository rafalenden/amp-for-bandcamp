import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { AUDIO_HOOK, type AudioHookMessage } from '../constants';

/**
 * Runs in the page's own JS world. Some Bandcamp pages (e.g. /discover) play
 * through an `Audio` object that is never attached to the DOM, so content
 * scripts cannot reach it. This hook remembers whichever media element the
 * page last played and applies volume and seek requests to it directly.
 */
export default defineUnlistedScript(() => {
  const root = document.documentElement;
  const marker = '__ampAudioHook';
  const page = window as unknown as Record<string, boolean>;
  if (page[marker]) return;
  page[marker] = true;

  let current: HTMLMediaElement | null = null;

  const applyVolume = () => {
    const raw = root.dataset[AUDIO_HOOK.volumeAttr];
    if (!current || raw === undefined) return;
    const volume = Number(raw) / 100;
    if (Number.isFinite(volume)) {
      current.volume = Math.min(1, Math.max(0, volume));
    }
  };

  const originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    current = this;
    root.dataset[AUDIO_HOOK.readyAttr] = '1';
    applyVolume();
    return originalPlay.call(this);
  };

  new MutationObserver(applyVolume).observe(root, {
    attributes: true,
    attributeFilter: ['data-amp-volume'],
  });

  window.addEventListener('message', (event) => {
    const message = event.data as Partial<AudioHookMessage> | null;
    if (
      event.source !== window ||
      message?.source !== AUDIO_HOOK.source ||
      message.type !== 'seek' ||
      typeof message.delta !== 'number' ||
      !current ||
      !Number.isFinite(current.duration)
    ) {
      return;
    }
    current.currentTime = Math.min(
      current.duration,
      Math.max(0, current.currentTime + message.delta),
    );
  });
});
