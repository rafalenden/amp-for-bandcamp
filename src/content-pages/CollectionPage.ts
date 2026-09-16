import type { Settings } from '../constants';
import { BasePage } from './BasePage';

export class CollectionPage extends BasePage {
  constructor(settings: Partial<Settings> = {}) {
    super(settings);
  }

  override init() {
    super.init();
    this.showTrackDetails();
    this.clickShowMore();
  }

  static override isMatch() {
    return !!document.querySelector<HTMLElement>('.collection-container');
  }

  showTrackDetails() {
    const makeVisible = () => {
      document
        .querySelectorAll<HTMLElement>(
          '.collection-item-actions, .collection-item-fav-track',
        )
        .forEach((action) => {
          action.style.visibility = 'visible';
        });
    };

    makeVisible();

    const container = document.querySelector<HTMLElement>(
      '.collection-container',
    );
    if (container) {
      new MutationObserver(makeVisible).observe(container, {
        childList: true,
        subtree: true,
      });
    }
  }

  clickShowMore() {
    const clickButtons = () => {
      const buttons = document.querySelectorAll<HTMLElement>('.show-more');
      if (buttons.length) {
        Array.from(buttons).forEach((btn) => btn.click());
      }
    };

    clickButtons();

    const observer = new MutationObserver(clickButtons);
    const container = document.querySelector('.collection-container');
    if (container)
      observer.observe(container, {
        childList: true,
        subtree: true,
      });
  }

  override togglePlayPause() {
    const playButtonOnPlayer =
      document.querySelector<HTMLElement>('.pause, .play');
    if (playButtonOnPlayer) {
      playButtonOnPlayer.click();
    } else {
      document.querySelector<HTMLElement>('.track_play_auxiliary')?.click();
    }
  }

  override nextSong() {
    const nextTrackPlayer = document.querySelector<HTMLElement>(
      '.next-icon:not(.disabled)',
    );
    if (nextTrackPlayer) {
      nextTrackPlayer.click();
      nextTrackPlayer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      const nextTrack = document
        .querySelector<HTMLElement>('.collection-item-container.playing')
        ?.nextElementSibling?.querySelector<HTMLElement>(
          '.track_play_auxiliary',
        );
      if (nextTrack) {
        nextTrack.click();
        nextTrack.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        super.nextSong();
      }
    }
  }

  override prevSong() {
    const prevTrackPlayer = document.querySelector<HTMLElement>(
      '.prev-icon:not(.disabled)',
    );
    if (prevTrackPlayer) {
      prevTrackPlayer.click();
      prevTrackPlayer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      const prevTrack = document
        .querySelector<HTMLElement>('.collection-item-container.playing')
        ?.previousElementSibling?.querySelector<HTMLElement>(
          '.track_play_auxiliary',
        );
      if (prevTrack) {
        prevTrack.click();
        prevTrack.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        super.prevSong();
      }
    }
  }

  override openCurrentTrack() {
    const container = document.querySelector<HTMLElement>(
      '.collection-item-container.playing',
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
      .querySelector<HTMLElement>('.wishlisted-msg.collection-btn')
      ?.click();
  }
}
