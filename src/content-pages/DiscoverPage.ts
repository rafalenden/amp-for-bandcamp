import { injectScript } from 'wxt/utils/inject-script';
import { AUDIO_HOOK, type AudioHookMessage, type Settings } from '../constants';
import { BasePage } from './BasePage';

/**
 * bandcamp.com/discover (Vue app rooted at #DiscoverApp).
 *
 * Playback UI lives in two places:
 *  - `.static-player`   – the "focused result" panel above the grid; it shows
 *                         the track the user clicked, even after the native
 *                         player has moved on to the next one.
 *  - `.floating-player` – the fixed bottom bar; it always reflects what is
 *                         actually playing and owns the seek slider.
 *
 * The page plays through an `Audio` object that is never attached to the DOM,
 * so volume and seeking go through the page-world audio hook
 * (`entrypoints/audio-hook.ts`); everything else goes through the UI.
 */
export class DiscoverPage extends BasePage {
  constructor(settings: Partial<Settings> = {}) {
    super(settings);
  }

  override init() {
    super.init();
    injectScript('/audio-hook.js').catch((error) => {
      console.error('[amp-for-bandcamp] Error injecting audio hook:', error);
    });
  }

  static override isMatch() {
    return !!document.querySelector<HTMLElement>('#DiscoverApp');
  }

  /**
   * The discover page's native player already continues to the next result
   * when a track ends, so running our own interval here would double-skip.
   */
  override setupAutoPlayNext() {
    if (this.autoPlayInterval) {
      clearInterval(this.autoPlayInterval);
      this.autoPlayInterval = null;
    }
  }

  override togglePlayPause() {
    const button =
      document.querySelector<HTMLElement>(
        '.floating-player .play-pause-button',
      ) ??
      document.querySelector<HTMLElement>(
        '.static-player .play-pause-button',
      ) ??
      document.querySelector<HTMLElement>(
        '.results-grid-item .play-pause-button',
      );
    button?.click();
  }

  override nextSong() {
    this._playSibling('nextElementSibling', '.floating-player .next-track');
  }

  override prevSong() {
    this._playSibling('previousElementSibling', '.floating-player .prev-track');
  }

  override openCurrentTrack() {
    const link =
      this._getCurrentGridItem()?.querySelector<HTMLAnchorElement>(
        'a[href*="/album/"], a[href*="/track/"]',
      ) ??
      document.querySelector<HTMLAnchorElement>(
        '.floating-player .track-meta a[href*="/album/"], .floating-player .track-meta a[href*="/track/"]',
      );
    if (link) {
      window.open(link.href, '_blank');
    }
  }

  override addToWishlist() {
    const button =
      document.querySelector<HTMLElement>(
        '.floating-player .wishlist-button',
      ) ?? document.querySelector<HTMLElement>('.wishlist-button');
    button?.click();
  }

  override fastForward() {
    this._seekBy(this.settings.seekSeconds);
  }

  override rewind() {
    this._seekBy(-this.settings.seekSeconds);
  }

  override isPlaying() {
    return !!document.querySelector(
      '.floating-player .play-pause-button[aria-label="Pause"]',
    );
  }

  /** The hook reads the volume from `<html>` whenever the page plays audio. */
  override applyVolumeOverride() {
    document.documentElement.dataset[AUDIO_HOOK.volumeAttr] = String(
      this.settings.volume,
    );
  }

  override setupVolumeControl() {
    this.applyVolumeOverride();
  }

  _seekBy(delta: number) {
    if (document.documentElement.dataset[AUDIO_HOOK.readyAttr]) {
      const message: AudioHookMessage = {
        source: AUDIO_HOOK.source,
        type: 'seek',
        delta,
      };
      window.postMessage(message, window.location.origin);
      return;
    }

    // The hook has not seen the page play audio yet: drive the slider.
    const slider = this._getSeekSlider();
    if (!slider) return;
    const total = Number(slider.max);
    if (!total) return;
    this._seekToSeconds(
      Math.min(total, Math.max(0, Number(slider.value) + delta)),
    );
  }

  /**
   * Plays the grid item adjacent to the current one, scrolling it into view.
   * Falls back to the native player-bar button when there is no adjacent
   * item (or the current one cannot be located).
   */
  _playSibling(
    direction: 'nextElementSibling' | 'previousElementSibling',
    fallbackSelector: string,
  ) {
    const sibling = this._getCurrentGridItem()?.[direction];
    const button = sibling?.querySelector<HTMLElement>('.play-pause-button');
    if (button) {
      button.click();
      button.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    document.querySelector<HTMLElement>(fallbackSelector)?.click();
  }

  /**
   * The grid item whose track is loaded in the player. While playing, its
   * button is labelled "Pause"; while paused, we match the floating player's
   * album/track link against the grid instead.
   */
  _getCurrentGridItem(): HTMLElement | null {
    const playing = document
      .querySelector<HTMLElement>(
        '.results-grid-item .play-pause-button[aria-label="Pause"]',
      )
      ?.closest<HTMLElement>('.results-grid-item');
    if (playing) return playing;

    const playerLink = document.querySelector<HTMLAnchorElement>(
      '.floating-player .track-meta a[href*="/album/"], .floating-player .track-meta a[href*="/track/"]',
    );
    if (!playerLink) return null;
    const target = this._itemKey(playerLink.href);

    for (const item of document.querySelectorAll<HTMLElement>(
      '.results-grid-item',
    )) {
      const link = item.querySelector<HTMLAnchorElement>(
        'a[href*="/album/"], a[href*="/track/"]',
      );
      if (link && this._itemKey(link.href) === target) return item;
    }
    return null;
  }

  /** Origin + pathname, ignoring Bandcamp's `?from=…&ui_context=…` tracking params. */
  _itemKey(href: string) {
    try {
      const url = new URL(href);
      return url.origin + url.pathname;
    } catch {
      return href;
    }
  }

  _getSeekSlider() {
    return (
      document.querySelector<HTMLInputElement>(
        '.floating-player .track-progress input[type="range"]',
      ) ??
      document.querySelector<HTMLInputElement>(
        '.track-progress input[type="range"]',
      )
    );
  }

  /**
   * The range input only commits a seek on mouseup, so emulate a click at the
   * position that corresponds to `seconds`. (Slider `max` is the track length
   * in seconds, `value` the current position.)
   */
  _seekToSeconds(seconds: number) {
    const slider = this._getSeekSlider();
    if (!slider) return;
    const total = Number(slider.max);
    if (!total) return;

    const rect = slider.getBoundingClientRect();
    const clientX = rect.left + rect.width * (seconds / total);
    const clientY = rect.top + rect.height / 2;

    slider.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, clientX, clientY }),
    );
    slider.value = String(seconds);
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(
      new MouseEvent('mouseup', { bubbles: true, clientX, clientY }),
    );
  }
}
