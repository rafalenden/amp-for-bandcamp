import type { Settings, SettingsChanges } from '../constants';
import { BasePage } from './BasePage';

export class FeedPage extends BasePage {
  progressBarContainer: HTMLDivElement | null;
  constructor(settings: Partial<Settings> = {}) {
    super(settings);
    this.progressBarContainer = null;
  }

  override init() {
    super.init();

    this.setupProgressBar();
  }

  static override isMatch() {
    return !!document.querySelector<HTMLElement>('#stories');
  }

  override togglePlayPause() {
    const playingTrack = document.querySelector<HTMLElement>(
      '.track_play_hilite.playing .tralbum-art-large',
    );
    if (playingTrack) {
      playingTrack.click();
    } else {
      const pausedTracks = document.querySelectorAll<HTMLElement>(
        '.track_play_hilite.paused .tralbum-art-large',
      );
      if (pausedTracks.length > 0) {
        pausedTracks[pausedTracks.length - 1]?.click();
      } else {
        const firstTrack = document.querySelectorAll<HTMLElement>(
          '.track_play_hilite .tralbum-art-large',
        )[0];
        firstTrack?.click();
      }
    }
  }

  override nextSong() {
    const currentStory = document.querySelector<HTMLElement>(
      '.collection-item-container.playing:last-child',
    )?.parentElement;
    if (!currentStory) {
      return;
    }

    // Find the next playable story by skipping non-playable ones
    let nextStory = currentStory.nextElementSibling;
    while (nextStory) {
      const nextTrack = nextStory.querySelector<HTMLElement>(
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

  override prevSong() {
    const currentStory = document.querySelector<HTMLElement>(
      '.collection-item-container.playing:last-child',
    )?.parentElement;
    if (!currentStory) {
      return;
    }

    // Find the previous playable story by skipping non-playable ones
    let prevStory = currentStory.previousElementSibling;
    while (prevStory) {
      const prevTrack = prevStory.querySelector<HTMLElement>(
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

      const target = document.querySelector<HTMLElement>(
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

        (
          target.querySelector<HTMLElement>('.story-body') || target
        ).appendChild(this.progressBarContainer);
      }

      if (audio.duration) {
        const innerBar = this.progressBarContainer.querySelector<HTMLElement>(
          '.playback-progress-inner',
        );
        if (innerBar)
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

  override applySettingsChanges(changes: SettingsChanges) {
    super.applySettingsChanges(changes);

    if (changes.showProgressBar !== undefined) {
      this.setupProgressBar();
    }
  }

  override openCurrentTrack() {
    const container = document.querySelector<HTMLElement>(
      '.collection-item-container.playing:last-child',
    );
    if (!container) return;

    const link = container.querySelector<HTMLAnchorElement>(
      'a[href*="/album/"], a[href*="/track/"]',
    );
    if (link) {
      window.open(link.href, '_blank');
    }
  }

  override addToWishlist() {
    document
      .querySelector<HTMLElement>(
        '.collection-item-container.playing .collect-item.wishlisted .wishlisted-msg, .collection-item-container.playing .collect-item:not(.wishlisted) .wishlist-msg',
      )
      ?.click();
  }
}
