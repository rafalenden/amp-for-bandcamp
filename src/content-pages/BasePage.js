import { DEFAULT_SETTINGS } from '../constants.js';

export class BasePage {
  constructor(settings = {}) {
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

  applyVolumeOverride() {
    const audio = this.getAudioElement();
    if (audio && this.settings.volume !== undefined) {
      audio.volume = this.settings.volume / 100;
    }
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (
        !this.settings.enableKeyboardShortcuts ||
        e.target.tagName === 'INPUT' ||
        e.target.tagName === 'TEXTAREA' ||
        e.target.tagName === 'MENU-BAR'
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

  fastForward() {
    const audio = this.getAudioElement();
    const seekTime = this.settings.seekSeconds;

    if (audio && audio.duration - audio.currentTime > seekTime) {
      audio.currentTime += seekTime;
    } else if (audio) {
      audio.currentTime = audio.duration - 1;
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
          for (let key in changes) {
            this.settings[key] = changes[key].newValue;
          }
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

  applySettingsChanges(changes) {
    if (changes.autoPlayNext !== undefined) {
      this.setupAutoPlayNext();
    }
    if (changes.showLeaveWarning !== undefined) {
      this.setupPageLeaveWarning();
    }
    if (changes.volume !== undefined) {
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

    this.autoPlayInterval = setInterval(() => {
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
        const audio = this.getAudioElement();
        if (audio && !audio.paused) {
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
    const audio = this.getAudioElement();
    if (audio) {
      this.applyVolumeOverride();

      const observer = new MutationObserver(() => {
        const newAudio = this.getAudioElement();
        if (newAudio && newAudio !== audio) {
          this.applyVolumeOverride();
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    } else {
      setTimeout(() => this.setupVolumeControl(), 1000);
    }
  }
}
