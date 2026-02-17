import { BasePage } from './BasePage.js';

export class CollectionPage extends BasePage {
  constructor(settings = {}) {
    super(settings);
  }

  init() {
    super.init();
    this.showTrackDetails();
    this.clickShowMore();
  }

  static isMatch() {
    return !!document.querySelector('.collection-container');
  }

  showTrackDetails() {
    const makeVisible = () => {
      document
        .querySelectorAll(
          '.collection-item-actions, .collection-item-fav-track',
        )
        .forEach((action) => {
          action.style.visibility = 'visible';
        });
    };

    makeVisible();

    const container = document.querySelector('.collection-container');
    if (container) {
      new MutationObserver(makeVisible).observe(container, {
        childList: true,
        subtree: true,
      });
    }
  }

  clickShowMore() {
    const clickButtons = () => {
      const buttons = document.querySelectorAll('.show-more');
      if (buttons.length) {
        Array.from(buttons).forEach((btn) => btn.click());
      }
    };

    clickButtons();

    const observer = new MutationObserver(clickButtons);
    observer.observe(document.querySelector('.collection-container'), {
      childList: true,
      subtree: true,
    });
  }

  togglePlayPause() {
    const playButtonOnPlayer = document.querySelector('.pause, .play');
    if (playButtonOnPlayer) {
      playButtonOnPlayer.click();
    } else {
      document.querySelector('.track_play_auxiliary')?.click();
    }
  }

  nextSong() {
    const nextTrackPlayer = document.querySelector('.next-icon:not(.disabled)');
    if (nextTrackPlayer) {
      nextTrackPlayer.click();
      nextTrackPlayer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      const nextTrack = document
        .querySelector('.collection-item-container.playing')
        ?.nextElementSibling?.querySelector('.track_play_auxiliary');
      if (nextTrack) {
        nextTrack.click();
        nextTrack.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        super.nextSong();
      }
    }
  }

  prevSong() {
    const prevTrackPlayer = document.querySelector('.prev-icon:not(.disabled)');
    if (prevTrackPlayer) {
      prevTrackPlayer.click();
      prevTrackPlayer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      const prevTrack = document
        .querySelector('.collection-item-container.playing')
        ?.previousElementSibling?.querySelector('.track_play_auxiliary');
      if (prevTrack) {
        prevTrack.click();
        prevTrack.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        super.prevSong();
      }
    }
  }

  openCurrentTrack() {
    const container = document.querySelector(
      '.collection-item-container.playing',
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
    document.querySelector('.wishlisted-msg.collection-btn')?.click();
  }
}
