import { BasePage } from './BasePage.js';

export class AlbumPage extends BasePage {
  constructor(settings = {}) {
    super(settings);
    this.progressBarContainer = null;
    this._trackedAudios = new Set();
  }

  init() {
    super.init();

    this._setupStickyPlayer();
    this._setupProgressBar();
  }

  static isMatch() {
    return !!document.querySelector('.inline_player');
  }

  // Enable autoplay only for related tracks as Bandcamp has it's own auto-play on album pages
  setupAutoPlayNext() {
    if (this.autoPlayInterval) {
      clearInterval(this.autoPlayInterval);
    }

    if (!this.settings.autoPlayNext) {
      return;
    }

    this.autoPlayInterval = setInterval(() => {
      const audio = this.getAudioElement();
      const isAudioEnding =
        audio &&
        audio.duration - audio.currentTime <= 1 &&
        audio.paused === false;

      const isPlayingLastTrackFromAlbum =
        document.querySelector('#track_table tr.current_track') ===
        document.querySelector('#track_table tr:last-child');
      const isPlayingRelatedTrack = this._getPlayingRelatedTrack();

      if (
        isAudioEnding &&
        (isPlayingLastTrackFromAlbum || isPlayingRelatedTrack)
      ) {
        this.nextSong();
      }
    }, 700);
  }

  applySettingsChanges(changes) {
    super.applySettingsChanges(changes);

    if (changes.stickyPlayer !== undefined) {
      this._setupStickyPlayer();
    }
    if (changes.showProgressBar !== undefined) {
      this._setupProgressBar();
    }
  }

  togglePlayPause() {
    const audio = this.getAudioElement();
    if (audio && audio.readyState > 0) {
      audio.paused ? audio.play() : audio.pause();
    } else {
      document.querySelector('.playbutton, .playpause')?.click();
    }
  }

  nextSong() {
    const nextButton = document.querySelector('.nextbutton');
    const isPlayingLastTrackFromAlbum =
      document.querySelector('#track_table tr.current_track') ===
      document.querySelector('#track_table tr:last-child');
    const playingRelatedTrack = this._getPlayingRelatedTrack();

    if (playingRelatedTrack) {
      playingRelatedTrack.parentElement.nextElementSibling
        .querySelector('.play-button')
        .click();
    } else if (isPlayingLastTrackFromAlbum) {
      const firstRecommendedTrack = document.querySelector(
        '.recommended-album .play-button',
      );
      firstRecommendedTrack.click();
      firstRecommendedTrack.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    } else if (nextButton) {
      nextButton.click();
    } else {
      super.nextSong();
    }
  }

  prevSong() {
    const prevButton = document.querySelector('.prevbutton');
    const playingRelatedTrack = this._getPlayingRelatedTrack();
    const isPlayingFirstTrackFromRecommended =
      document.querySelector(
        '.recommendations-content .recommended-album .playing',
      )?.parentElement ===
      document.querySelector(
        '.recommendations-content .recommended-album:first-child',
      );

    if (isPlayingFirstTrackFromRecommended) {
      const lastTrackFromAlbum =
        document.querySelector('#track_table tr:last-child .play_status') ??
        document.querySelector('.playbutton');
      lastTrackFromAlbum?.click();
      lastTrackFromAlbum?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    } else if (playingRelatedTrack) {
      playingRelatedTrack?.parentElement?.previousElementSibling
        ?.querySelector('.play-button')
        ?.click();
    } else if (prevButton) {
      prevButton.click();
    } else {
      super.prevSong();
    }
  }

  addToWishlist() {
    const playingRelatedTrack = this._getPlayingRelatedTrack();
    if (playingRelatedTrack) {
      const relatedTrackUrl =
        playingRelatedTrack.parentElement.querySelector('a.album-link').href;
      window.open(relatedTrackUrl, '_blank');
    } else {
      document
        .querySelector('.wishlist #wishlist-msg, .wishlisted #wishlisted-msg')
        ?.click();
    }
  }

  openCurrentTrack() {
    const playingRelatedTrack = this._getPlayingRelatedTrack();
    if (playingRelatedTrack) {
      const url =
        playingRelatedTrack.parentElement.querySelector('a.album-link').href;
      window.open(url, '_blank');
    }
  }

  _setupStickyPlayer() {
    const player = document.querySelector('.inline_player');
    if (!player) {
      return;
    }

    if (!this.settings.stickyPlayer) {
      player.classList.remove('sticky');
      return;
    }

    if (this.settings.stickyPlayer) {
      player.classList.add('sticky');

      const styleElement = document.getElementById('custom-design-rules-style');
      if (styleElement) {
        try {
          const designData = JSON.parse(
            styleElement.getAttribute('data-design'),
          );
          if (designData.body_color) {
            player.style.backgroundColor = `#${designData.body_color}`;
          }
        } catch (e) {
          console.error('[amp-for-bandcamp] Error parsing design data:', e);
        }
      }
    }
  }

  _getPlayingRelatedTrack() {
    return document.querySelector('.recommended-album .playing');
  }

  _setupProgressBar() {
    if (!this.settings.showProgressBar) {
      if (this.progressBarContainer) {
        this.progressBarContainer.style.display = 'none';
      }
      return;
    }

    const update = () => {
      const audio = this.getAudioElement();
      if (!audio || audio.paused || !audio.duration) return;

      const playingRelated = this._getPlayingRelatedTrack();
      const container = playingRelated
        ? playingRelated.closest('.recommended-album')
        : document.querySelector('#tralbumArt');

      if (!container) return;

      if (
        !this.progressBarContainer ||
        !container.contains(this.progressBarContainer)
      ) {
        if (this.progressBarContainer) this.progressBarContainer.remove();

        this.progressBarContainer = document.createElement('div');
        this.progressBarContainer.className =
          'playback-progress album-art-progress';
        this.progressBarContainer.innerHTML =
          '<div class="playback-progress-inner"></div>';

        let artChild = container.querySelector('img');
        while (artChild && artChild.parentElement !== container) {
          artChild = artChild.parentElement;
        }
        if (artChild) {
          artChild.after(this.progressBarContainer);
        } else {
          container.appendChild(this.progressBarContainer);
        }
      }

      this.progressBarContainer.querySelector(
        '.playback-progress-inner',
      ).style.width = `${(audio.currentTime / audio.duration) * 100}%`;
      this.progressBarContainer.style.display = 'block';
    };

    const hide = () => {
      if (this.progressBarContainer)
        this.progressBarContainer.style.display = 'none';
    };

    const attach = (audio) => {
      if (this._trackedAudios.has(audio)) return;
      this._trackedAudios.add(audio);
      audio.addEventListener('timeupdate', update);
      audio.addEventListener('play', update);
      audio.addEventListener('pause', update);
      audio.addEventListener('ended', hide);
    };

    document.querySelectorAll('audio').forEach(attach);
    new MutationObserver(() =>
      document.querySelectorAll('audio').forEach(attach),
    ).observe(document.body, { childList: true, subtree: true });
  }
}
