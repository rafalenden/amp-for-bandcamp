import { injectScript } from 'wxt/utils/inject-script';
import { AUDIO_HOOK, type AudioHookMessage } from '../constants';
import { BasePage } from './BasePage';

/** The fixed bottom bar; it always reflects what is actually playing. */
const PLAYER_BAR = '.floating-player .player-bar';
/** A row of the pop-up tracklist, which only exists while it is expanded. */
const TRACKLIST_ITEM = '.floating-player .track-list-item';

/**
 * Pages built on Bandcamp's Vue player (`.floating-player`): the homepage and
 * /discover.
 *
 * The player has two parts:
 *  - `.player-bar`    – the bottom bar with play/pause, the seek slider and,
 *                       for track lists, skip buttons, a wishlist button and
 *                       a link to the release.
 *  - `.player-dialog` – the pop-up tracklist above the bar. Its rows carry
 *                       their own play and wishlist buttons, so selectors for
 *                       the bar must be scoped to `.player-bar`.
 *
 * The page plays through an `Audio` object that is never attached to the DOM,
 * so volume and seeking go through the page-world audio hook
 * (`entrypoints/audio-hook.ts`); everything else goes through the UI.
 */
export class FloatingPlayerPage extends BasePage {
  override init() {
    super.init();
    injectScript('/audio-hook.js').catch((error) => {
      console.error('[amp-for-bandcamp] Error injecting audio hook:', error);
    });
  }

  /**
   * The native player already continues to the next track when one ends, so
   * running our own interval here would double-skip.
   */
  override setupAutoPlayNext() {
    if (this.autoPlayInterval) {
      clearInterval(this.autoPlayInterval);
      this.autoPlayInterval = null;
    }
  }

  override togglePlayPause() {
    this._getBarElement('.play-pause-button')?.click();
  }

  override nextSong() {
    this._skipTrack('next');
  }

  override prevSong() {
    this._skipTrack('prev');
  }

  override openCurrentTrack() {
    const link = this._getBarElement<HTMLAnchorElement>('.track-meta a[href]');
    if (link) {
      window.open(link.href, '_blank');
    }
  }

  override addToWishlist() {
    const button =
      this._getBarElement('.wishlist-button') ??
      document.querySelector<HTMLElement>(
        `${TRACKLIST_ITEM}.currently-playing .wishlist-button`,
      );
    button?.click();
  }

  override fastForward() {
    this._seekBy(this.settings.seekSeconds);
  }

  override rewind() {
    this._seekBy(-this.settings.seekSeconds);
  }

  override isPlaying() {
    return !!this._getBarElement('.play-pause-button[aria-label="Pause"]');
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

  _getBarElement<T extends HTMLElement = HTMLElement>(selector: string) {
    return document.querySelector<T>(`${PLAYER_BAR} ${selector}`);
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

  /**
   * Skips with the bar's buttons. Radio shows are one long stream without
   * skip buttons; their segments are only reachable through the tracklist.
   */
  _skipTrack(direction: 'next' | 'prev') {
    const button = this._getBarElement(`.${direction}-track`);
    if (button) {
      button.click();
      return;
    }

    if (this._playTracklistSibling(direction)) return;

    // The tracklist is not rendered while collapsed: expand it and retry.
    const expand = this._getBarElement('.expand-button');
    const player = document.querySelector('.floating-player');
    if (!expand || !player || document.querySelector(TRACKLIST_ITEM)) return;

    const observer = new MutationObserver(() => {
      if (document.querySelector(`${TRACKLIST_ITEM}.currently-playing`)) {
        observer.disconnect();
        this._playTracklistSibling(direction);
      }
    });
    // Give up quietly if the tracklist never shows up.
    window.setTimeout(() => observer.disconnect(), 3000);
    observer.observe(player, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    expand.click();
  }

  /** Plays the tracklist row next to the current one, if there is one. */
  _playTracklistSibling(direction: 'next' | 'prev') {
    const current = document.querySelector(
      `${TRACKLIST_ITEM}.currently-playing`,
    );
    const sibling =
      direction === 'next'
        ? current?.nextElementSibling
        : current?.previousElementSibling;
    const button = sibling?.querySelector<HTMLElement>('.play-pause-button');
    button?.click();
    return !!button;
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

  _getSeekSlider() {
    return this._getBarElement<HTMLInputElement>(
      '.track-progress input[type="range"]',
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
