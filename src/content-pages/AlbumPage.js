import { BasePage } from './BasePage.js';

export class AlbumPage extends BasePage {
  constructor(settings = {}) {
    super(settings);
  }

  init() {
    super.init();

    this.setupStickyPlayer();
  }

  static isMatch() {
    return !!document.querySelector('.inline_player');
  }

  setupAutoPlayNext() {
    // Disable on album pages as Bandcamp has it's own auto-play
  }

  applySettingsChanges(changes) {
    super.applySettingsChanges(changes);

    if (changes.stickyPlayer !== undefined) {
      this.setupStickyPlayer();
    }
  }

  togglePlayPause() {
    document.querySelector('.playbutton, .playpause')?.click();
  }

  setupStickyPlayer() {
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

  nextSong() {
    const nextButton = document.querySelector('.nextbutton');
    if (nextButton) {
      nextButton.click();
    } else {
      super.nextSong();
    }
  }

  prevSong() {
    const prevButton = document.querySelector('.prevbutton');
    if (prevButton) {
      prevButton.click();
    } else {
      super.prevSong();
    }
  }

  addToWishlist() {
    document
      .querySelector('.wishlist #wishlist-msg, .wishlisted #wishlisted-msg')
      ?.click();
  }
}
