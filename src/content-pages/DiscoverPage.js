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

  seekToPosition(position) {
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

  fastForward() {
    const slider = document.querySelector('.seek-control');
    const totalTimeSpan = document.querySelector('.playback-time.total');
    if (!slider || !totalTimeSpan) return;

    const [minutes, seconds] = totalTimeSpan.textContent.split(':').map(Number);
    const totalSeconds = minutes * 60 + seconds;

    const currentSeconds = slider.value * totalSeconds;
    const seekTime = this.settings.seekSeconds;
    const newSeconds = Math.min(currentSeconds + seekTime, totalSeconds);
    const newPosition = newSeconds / totalSeconds;

    this.seekToPosition(newPosition);
  }

  rewind() {
    const slider = document.querySelector('.seek-control');
    const totalTimeSpan = document.querySelector('.playback-time.total');
    if (!slider || !totalTimeSpan) return;

    const [minutes, seconds] = totalTimeSpan.textContent.split(':').map(Number);
    const totalSeconds = minutes * 60 + seconds;

    const currentSeconds = slider.value * totalSeconds;
    const seekTime = this.settings.seekSeconds;
    const newSeconds = Math.max(0, currentSeconds - seekTime);
    const newPosition = newSeconds / totalSeconds;

    this.seekToPosition(newPosition);
  }
}
