import type { Settings } from '../constants';
import { BasePage } from './BasePage';

export class DiscoverPage extends BasePage {
  constructor(settings: Partial<Settings> = {}) {
    super(settings);
  }

  override init() {
    super.init();
  }

  static override isMatch() {
    return !!document.querySelector<HTMLElement>('#DiscoverApp');
  }

  override setupAutoPlayNext() {
    if (this.autoPlayInterval) {
      clearInterval(this.autoPlayInterval);
    }

    if (!this.settings.autoPlayNext) {
      return;
    }

    this.autoPlayInterval = window.setInterval(() => {
      const totalSeconds = this._getPlaybackTotalSeconds();
      const currentSeconds = this._getPlaybackCurrentSeconds();
      if (!totalSeconds || !currentSeconds) return;

      if (totalSeconds - currentSeconds <= 1) {
        this.nextSong();
      }
    }, 700);
  }

  override togglePlayPause() {
    document
      .querySelector<HTMLElement>('.focused-result .play-pause-button')
      ?.click();
  }

  override nextSong() {
    const currentTrack = document
      .querySelector<HTMLElement>('.pause-circle-outline-icon')
      ?.closest('.results-grid-item');
    const nextTrack =
      currentTrack?.nextElementSibling?.querySelector<HTMLElement>(
        '.play-pause-button',
      );
    if (nextTrack) {
      nextTrack.click();
      nextTrack.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      super.nextSong();
    }
  }

  override prevSong() {
    const currentTrack = document
      .querySelector<HTMLElement>('.pause-circle-outline-icon')
      ?.closest('.results-grid-item');
    const prevTrack =
      currentTrack?.previousElementSibling?.querySelector<HTMLElement>(
        '.play-pause-button',
      );
    if (prevTrack) {
      prevTrack.click();
      prevTrack.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      super.nextSong();
    }
  }

  override openCurrentTrack() {
    const currentTrack = document
      .querySelector<HTMLElement>('.pause-circle-outline-icon')
      ?.closest('.results-grid-item');
    if (!currentTrack) return;

    const link = currentTrack.querySelector<HTMLAnchorElement>(
      'a[href*="/album/"], a[href*="/track/"]',
    );
    if (link) {
      window.open(link.href, '_blank');
    }
  }

  override addToWishlist() {
    document.querySelector<HTMLElement>('.wishlist-button')?.click();
  }

  _seekToPosition(position: number) {
    const slider = document.querySelector<HTMLInputElement>('.seek-control');
    if (!slider) return;

    const rect = slider.getBoundingClientRect();
    const clickX = rect.left + rect.width * position;

    slider.value = String(position);
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
    const totalTimeSpan = document.querySelector<HTMLElement>(
      '.playback-time.total',
    );
    if (!totalTimeSpan) {
      return;
    }
    const [minutes = 0, seconds = 0] = totalTimeSpan.textContent
      .split(':')
      .map(Number);
    return minutes * 60 + seconds;
  }

  _getPlaybackCurrentSeconds() {
    const currentTimeSpan = document.querySelector<HTMLElement>(
      '.playback-time.current',
    );
    if (!currentTimeSpan) {
      return;
    }
    const [minutes = 0, seconds = 0] = currentTimeSpan.textContent
      .split(':')
      .map(Number);
    return minutes * 60 + seconds;
  }

  override fastForward() {
    const slider = document.querySelector<HTMLInputElement>('.seek-control');
    const playbackTotalSeconds = this._getPlaybackTotalSeconds();
    if (!slider || !playbackTotalSeconds) {
      return;
    }

    const currentSeconds = Number(slider.value) * playbackTotalSeconds;
    const seekTime = this.settings.seekSeconds;
    const newSeconds = Math.min(
      currentSeconds + seekTime,
      playbackTotalSeconds,
    );
    const newPosition = newSeconds / playbackTotalSeconds;

    this._seekToPosition(newPosition);
  }

  override rewind() {
    const slider = document.querySelector<HTMLInputElement>('.seek-control');
    const playbackTotalSeconds = this._getPlaybackTotalSeconds();
    if (!slider || !playbackTotalSeconds) {
      return;
    }

    const currentSeconds = Number(slider.value) * playbackTotalSeconds;
    const seekTime = this.settings.seekSeconds;
    const newSeconds = Math.max(0, currentSeconds - seekTime);
    const newPosition = newSeconds / playbackTotalSeconds;

    this._seekToPosition(newPosition);
  }
}
