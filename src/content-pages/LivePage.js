import { BasePage } from './BasePage.js';

export class LivePage extends BasePage {
  static isMatch() {
    return window.location.pathname.startsWith('/live/');
  }

  init() {
    this.setupKeyboardShortcuts();
    this.setupSettingsListeners();
    this.setupPageLeaveWarning();
    this.setupVolumeControl();
  }

  getVolumeControl() {
    return document.querySelector('input.volume-control[type="range"]');
  }

  applyVolumeOverride() {
    const control = this.getVolumeControl();
    if (control && this.settings.volume !== undefined) {
      control.value = this.settings.volume;
      control.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  setupVolumeControl() {
    const control = this.getVolumeControl();
    if (control) {
      this.applyVolumeOverride();
    } else {
      setTimeout(() => this.setupVolumeControl(), 1000);
    }
  }

  setupPageLeaveWarning() {
    if (this.pageLeaveHandler) {
      window.removeEventListener('beforeunload', this.pageLeaveHandler);
    }

    if (this.settings.showLeaveWarning) {
      this.pageLeaveHandler = (e) => {
        const message =
          'A live stream is playing. Are you sure you want to leave?';
        e.returnValue = message;
        return message;
      };
      window.addEventListener('beforeunload', this.pageLeaveHandler);
    }
  }

  addToWishlist() {
    document.querySelector('.wishlist-button')?.click();
  }
}
