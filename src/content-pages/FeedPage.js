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
    const currentStory = document.querySelector(
      '.collection-item-container.playing:last-child',
    )?.parentElement;
    if (!currentStory) {
      return;
    }

    // Find the next playable story by skipping non-playable ones
    let nextStory = currentStory.nextElementSibling;
    while (nextStory) {
      const nextTrack = nextStory.querySelector(
        '.track_play_hilite .tralbum-art-large',
      );
      if (nextTrack) {
        nextTrack.click();
        nextTrack.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      nextStory = nextStory.nextElementSibling;
    }
  }

  prevSong() {
    const currentStory = document.querySelector(
      '.collection-item-container.playing:last-child',
    )?.parentElement;
    if (!currentStory) {
      return;
    }

    // Find the previous playable story by skipping non-playable ones
    let prevStory = currentStory.previousElementSibling;
    while (prevStory) {
      const prevTrack = prevStory.querySelector(
        '.track_play_hilite .tralbum-art-large',
      );
      if (prevTrack) {
        prevTrack.click();
        prevTrack.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      prevStory = prevStory.previousElementSibling;
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

  openCurrentTrack() {
    const container = document.querySelector(
      '.collection-item-container.playing:last-child',
    );
    if (!container) return;

    const link = container.querySelector(
      'a[href*="/album/"], a[href*="/track/"]',
    );
    if (link) {
      window.open(link.href, '_blank');
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
