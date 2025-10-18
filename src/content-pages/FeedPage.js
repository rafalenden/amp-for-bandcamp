import { BasePage } from './BasePage.js';

export class FeedPage extends BasePage {
  constructor(settings = {}) {
    super(settings);
    this.progressBarContainer = null;
  }

  init() {
    super.init();

    this.setupProgressBar();
  }

  static isMatch() {
    return !!document.querySelector('#stories');
  }

  togglePlayPause() {
    const playingTrack = document.querySelector(
      '.track_play_hilite.playing .tralbum-art-large',
    );
    if (playingTrack) {
      playingTrack.click();
    } else {
      const pausedTracks = document.querySelectorAll(
        '.track_play_hilite.paused .tralbum-art-large',
      );
      if (pausedTracks.length > 0) {
        pausedTracks[pausedTracks.length - 1].click();
      } else {
        const firstTrack = document.querySelectorAll(
          '.track_play_hilite .tralbum-art-large',
        )[0];
        firstTrack?.click();
      }
    }
  }

  nextSong() {
    const nextTrack = document
      .querySelector('.collection-item-container.playing:last-child')
      ?.parentElement?.nextElementSibling?.querySelector('.tralbum-art-large');
    if (nextTrack) {
      nextTrack.click();
      nextTrack.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  prevSong() {
    const prevTrack = document
      .querySelector('.collection-item-container.playing:last-child')
      ?.parentElement?.previousElementSibling?.querySelector(
        '.tralbum-art-large',
      );
    if (prevTrack) {
      prevTrack.click();
      prevTrack.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  setupProgressBar() {
    if (!this.settings.showProgressBar) {
      return;
    }

    const audio = document.querySelector('audio');
    if (!audio) return;

    const updateProgressBar = () => {
      if (!this.settings.showProgressBar) {
        if (this.progressBarContainer) {
          this.progressBarContainer.style.display = 'none';
        }
        return;
      }

      const target = document.querySelector(
        '.collection-item-container.playing:last-child',
      );

      if (!target) return;

      if (
        !this.progressBarContainer ||
        this.progressBarContainer.parentElement !== target
      ) {
        if (this.progressBarContainer) this.progressBarContainer.remove();

        this.progressBarContainer = document.createElement('div');
        this.progressBarContainer.className = 'playback-progress';
        this.progressBarContainer.innerHTML =
          '<div class="playback-progress-inner"></div>';

        (target.querySelector('.story-body') || target).appendChild(
          this.progressBarContainer,
        );
      }

      if (audio.duration) {
        const innerBar = this.progressBarContainer.querySelector(
          '.playback-progress-inner',
        );
        innerBar.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
      }

      this.progressBarContainer.style.display = 'block';
    };

    audio.addEventListener('play', updateProgressBar);
    audio.addEventListener('pause', updateProgressBar);
    audio.addEventListener('timeupdate', updateProgressBar);
    audio.addEventListener('ended', () => {
      if (this.progressBarContainer)
        this.progressBarContainer.style.display = 'none';
    });

    if (!audio.paused) updateProgressBar();
  }

  applySettingsChanges(changes) {
    super.applySettingsChanges(changes);

    if (changes.showProgressBar !== undefined) {
      this.setupProgressBar();
    }
  }

  addToWishlist() {
    document
      .querySelector(
        '.collection-item-container.playing .collect-item.wishlisted .wishlisted-msg, .collection-item-container.playing .collect-item:not(.wishlisted) .wishlist-msg',
      )
      ?.click();
  }
}
