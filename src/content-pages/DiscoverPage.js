import { BasePage } from './BasePage.js';

export class DiscoverPage extends BasePage {
  constructor(settings = {}) {
    super(settings);
  }

  init() {
    super.init();
  }

  static isMatch() {
    return !!document.querySelector('#DiscoverApp');
  }

  setupAutoPlayNext() {
    if (this.autoPlayInterval) {
      clearInterval(this.autoPlayInterval);
    }

    if (!this.settings.autoPlayNext) {
      return;
    }

    this.autoPlayInterval = setInterval(() => {
      const totalSeconds = this._getPlaybackTotalSeconds();
      const currentSeconds = this._getPlaybackCurrentSeconds();
      if (!totalSeconds || !currentSeconds) return;

      if (totalSeconds - currentSeconds <= 1) {
        this.nextSong();
      }
    }, 700);
  }

  togglePlayPause() {
    document.querySelector('.focused-result .play-pause-button')?.click();
  }

  nextSong() {
    const currentTrack = document
      .querySelector('.pause-circle-outline-icon')
      .closest('.results-grid-item');
    const nextTrack =
      currentTrack?.nextElementSibling?.querySelector('.play-pause-button');
    if (nextTrack) {
      nextTrack.click();
      nextTrack.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      super.nextSong();
    }
  }

  prevSong() {
    const currentTrack = document
      .querySelector('.pause-circle-outline-icon')
      .closest('.results-grid-item');
    const prevTrack =
      currentTrack?.previousElementSibling?.querySelector('.play-pause-button');
    if (prevTrack) {
      prevTrack.click();
      prevTrack.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      super.nextSong();
    }
  }

  addToWishlist() {
    document.querySelector('.wishlist-button')?.click();
  }

  _seekToPosition(position) {
    const slider = document.querySelector('.seek-control');
    if (!slider) return;

    const rect = slider.getBoundingClientRect();
    const clickX = rect.left + rect.width * position;

    slider.value = position;
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));

    slider.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        clientX: clickX,
      }),
    );
    slider.dispatchEvent(
      new MouseEvent('mouseup', {
        bubbles: true,
        clientX: clickX,
      }),
    );
  }

  _getPlaybackTotalSeconds() {
    const totalTimeSpan = document.querySelector('.playback-time.total');
    if (!totalTimeSpan) {
      return;
    }
    const [minutes, seconds] = totalTimeSpan.textContent.split(':').map(Number);
    return minutes * 60 + seconds;
  }

  _getPlaybackCurrentSeconds() {
    const currentTimeSpan = document.querySelector('.playback-time.current');
    if (!currentTimeSpan) {
      return;
    }
    const [minutes, seconds] = currentTimeSpan.textContent.split(':').map(Number);
    return minutes * 60 + seconds;
  }

  fastForward() {
    const slider = document.querySelector('.seek-control');
    const playbackTotalSeconds = this._getPlaybackTotalSeconds();
    if (!slider || !playbackTotalSeconds) {
      return;
    }

    const currentSeconds = slider.value * playbackTotalSeconds;
    const seekTime = this.settings.seekSeconds;
    const newSeconds = Math.min(
      currentSeconds + seekTime,
      playbackTotalSeconds,
    );
    const newPosition = newSeconds / playbackTotalSeconds;

    this._seekToPosition(newPosition);
  }

  rewind() {
    const slider = document.querySelector('.seek-control');
    const playbackTotalSeconds = this._getPlaybackTotalSeconds();
    if (!slider || !playbackTotalSeconds) {
      return;
    }

    const currentSeconds = slider.value * playbackTotalSeconds;
    const seekTime = this.settings.seekSeconds;
    const newSeconds = Math.max(0, currentSeconds - seekTime);
    const newPosition = newSeconds / playbackTotalSeconds;

    this._seekToPosition(newPosition);
  }
}
