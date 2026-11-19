import { browser } from 'wxt/browser';
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  type Settings,
  type SettingsChanges,
} from '../constants';

export class BasePage {
  settings: Settings;
  autoPlayInterval: number | null;
  /** True while the visitor drags Bandcamp's own volume slider. */
  adjustingNativeVolume = false;
  pageLeaveHandler: ((event: BeforeUnloadEvent) => string | undefined) | null;
  constructor(settings: Partial<Settings> = {}) {
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...settings,
    };
    this.autoPlayInterval = null;
    this.pageLeaveHandler = null;
  }

  init() {
    this.setupKeyboardShortcuts();
    this.setupSettingsListeners();
    this.setupAutoPlayNext();
    this.setupPageLeaveWarning();
    this.setupVolumeControl();
  }

  static isMatch() {
    return false;
  }

  getAudioElement() {
    const audios = document.querySelectorAll('audio');
    const playing = [...audios].find((a) => !a.paused);
    return playing || audios[0] || null;
  }

  /** Volume to apply, as a 0–100 percentage; 0 while muted. */
  getEffectiveVolume() {
    return this.settings.muted ? 0 : this.settings.volume;
  }

  isPlaying() {
    const audio = this.getAudioElement();
    return !!audio && !audio.paused;
  }

  applyVolumeOverride() {
    this.syncCarouselVolume();
    document
      .querySelectorAll('audio')
      .forEach((audio) => this.applyVolumeTo(audio));
  }

  /** Saves a volume the visitor picked on the page, as the popup would. */
  saveVolume(volume: number) {
    const rounded = Math.min(100, Math.max(0, Math.round(volume)));
    if (rounded === this.getEffectiveVolume()) return;
    browser.storage.sync
      .set({ volume: rounded, muted: false })
      .catch((error) => {
        console.error('[amp-for-bandcamp] Error saving volume:', error);
      });
  }

  /**
   * The player at the bottom of the feed and collection pages has its own
   * volume slider, and sets the audio volume from it. `.vol-amt` is the filled
   * part of the bar; its width is the player's volume in percent.
   */
  getCarouselVolume() {
    const slider = document.querySelector<HTMLElement>(
      '.carousel-player .vol-slider',
    );
    const amount = slider?.querySelector<HTMLElement>('.vol-amt');
    if (!slider || !amount) return null;
    return {
      slider,
      read: () => parseFloat(amount.style.width) || 0,
    };
  }

  /** Moves the bottom player's slider to the extension's volume. */
  syncCarouselVolume() {
    const control = this.getCarouselVolume();
    if (!control || this.adjustingNativeVolume) return;
    const rect = control.slider.getBoundingClientRect();
    if (!rect.width) return;

    // The player reads the volume from where the bar is clicked. Its own
    // offset is a pixel or so off the bar's edge, so correct and retry.
    const target = this.getEffectiveVolume();
    let x = rect.left + (rect.width * target) / 100;
    for (let i = 0; i < 3 && Math.abs(control.read() - target) > 0.5; i++) {
      control.slider.dispatchEvent(
        new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: rect.top + rect.height / 2,
        }),
      );
      x += ((target - control.read()) * rect.width) / 100;
    }
  }

  /** Follows the visitor's own changes on the bottom player's slider. */
  setupCarouselVolumeListener() {
    document.addEventListener(
      'mousedown',
      (event) => {
        if (
          event.isTrusted &&
          event.target instanceof Element &&
          event.target.closest('.carousel-player .vol')
        ) {
          this.adjustingNativeVolume = true;
        }
      },
      true,
    );
    document.addEventListener(
      'mouseup',
      (event) => {
        if (!event.isTrusted || !this.adjustingNativeVolume) return;
        // Let the player handle the release (and a click) first.
        window.setTimeout(() => {
          this.adjustingNativeVolume = false;
          const control = this.getCarouselVolume();
          if (control) this.saveVolume(control.read());
          this.applyVolumeOverride();
        }, 50);
      },
      true,
    );
  }

  applyVolumeTo(audio: HTMLMediaElement) {
    if (this.adjustingNativeVolume) return;
    const volume = this.getEffectiveVolume() / 100;
    // Writing an unchanged value would still fire `volumechange`.
    if (audio.volume !== volume) audio.volume = volume;
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (
        !this.settings.enableKeyboardShortcuts ||
        !this.hasPlayer() ||
        (e.target as HTMLElement | null)?.tagName === 'INPUT' ||
        (e.target as HTMLElement | null)?.tagName === 'TEXTAREA' ||
        (e.target as HTMLElement | null)?.tagName === 'MENU-BAR'
      ) {
        return;
      }

      // See https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_code_values
      switch (e.code) {
        case 'Space':
        case 'MediaPlayPause':
          e.preventDefault();
          this.togglePlayPause();
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.fastForward();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.rewind();
          break;
        case 'ArrowUp':
        case 'MediaTrackPrevious':
          e.preventDefault();
          this.prevSong();
          break;
        case 'ArrowDown':
        case 'MediaTrackNext':
          e.preventDefault();
          this.nextSong();
          break;
        case 'KeyW':
          e.preventDefault();
          this.addToWishlist();
          break;
        case 'Enter':
          e.preventDefault();
          this.openCurrentTrack();
          break;
      }
    });
  }

  /**
   * Whether there is anything for the shortcuts to control. While there is
   * not, keys keep their normal behaviour (e.g. scrolling the page).
   */
  hasPlayer() {
    return true;
  }

  fastForward() {
    const audio = this.getAudioElement();
    const seekTime = this.settings.seekSeconds;

    if (!audio || audio.paused) {
      return;
    }

    if (audio.duration - audio.currentTime > seekTime) {
      audio.currentTime += seekTime;
    }
  }

  rewind() {
    const audio = this.getAudioElement();
    const seekTime = this.settings.seekSeconds;

    if (audio) {
      audio.currentTime = Math.max(0, audio.currentTime - seekTime);
    }
  }

  togglePlayPause() {}

  nextSong() {}

  prevSong() {}

  addToWishlist() {}

  openCurrentTrack() {}

  setupSettingsListeners() {
    try {
      browser.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync') {
          this.settings = mergeSettings(this.settings, changes);
          this.applySettingsChanges(changes);
        }
      });
    } catch (e) {
      console.error(
        '[amp-for-bandcamp] Error setting up settings listener:',
        e,
      );
    }
  }

  applySettingsChanges(changes: SettingsChanges) {
    if (changes.autoPlayNext !== undefined) {
      this.setupAutoPlayNext();
    }
    if (changes.showLeaveWarning !== undefined) {
      this.setupPageLeaveWarning();
    }
    if (changes.volume !== undefined || changes.muted !== undefined) {
      this.applyVolumeOverride();
    }
  }

  setupAutoPlayNext() {
    if (this.autoPlayInterval) {
      clearInterval(this.autoPlayInterval);
    }

    if (!this.settings.autoPlayNext) {
      return;
    }

    this.autoPlayInterval = window.setInterval(() => {
      const audio = this.getAudioElement();
      if (audio && audio.duration - audio.currentTime <= 1) {
        this.nextSong();
      }
    }, 700);
  }

  setupPageLeaveWarning() {
    if (this.pageLeaveHandler) {
      window.removeEventListener('beforeunload', this.pageLeaveHandler);
    }

    if (this.settings.showLeaveWarning) {
      this.pageLeaveHandler = (e) => {
        if (this.isPlaying()) {
          const message =
            'Music is still playing. Are you sure you want to leave?';
          e.returnValue = message;
          return message;
        }
      };
      window.addEventListener('beforeunload', this.pageLeaveHandler);
    }
  }

  setupVolumeControl() {
    this.applyVolumeOverride();
    this.setupCarouselVolumeListener();

    // Bandcamp's players set the volume themselves, for example when a track
    // starts, and some pages play through more than one element. Media events
    // do not bubble, but capturing on the document sees them for every
    // element, so the chosen volume (or mute) always wins.
    const enforce = (event: Event) => {
      if (event.target instanceof HTMLMediaElement) {
        // The bottom player may only become visible once something plays.
        if (event.type !== 'volumechange') this.syncCarouselVolume();
        this.applyVolumeTo(event.target);
      }
    };
    for (const type of ['loadstart', 'play', 'playing', 'volumechange']) {
      document.addEventListener(type, enforce, true);
    }

    // Players added later start at full volume until they first play.
    new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.addedNodes.length)) {
        this.applyVolumeOverride();
      }
    }).observe(document.body, { childList: true, subtree: true });
  }
}
