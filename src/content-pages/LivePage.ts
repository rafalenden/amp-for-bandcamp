import { BasePage } from './BasePage';

export class LivePage extends BasePage {
  static override isMatch() {
    return window.location.pathname.startsWith('/live/');
  }

  override init() {
    this.setupKeyboardShortcuts();
    this.setupSettingsListeners();
    this.setupPageLeaveWarning();
    this.setupVolumeControl();
  }

  getVolumeControl() {
    return document.querySelector<HTMLInputElement>(
      'input.volume-control[type="range"]',
    );
  }

  override applyVolumeOverride() {
    const control = this.getVolumeControl();
    if (control) {
      control.value = String(this.getEffectiveVolume());
      control.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  override setupVolumeControl() {
    const control = this.getVolumeControl();
    if (control) {
      this.applyVolumeOverride();
      // Follow the visitor's own changes on the stream's slider.
      control.addEventListener('change', (event) => {
        if (event.isTrusted) this.saveVolume(Number(control.value));
      });
    } else {
      setTimeout(() => this.setupVolumeControl(), 1000);
    }
  }

  override setupPageLeaveWarning() {
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

  override addToWishlist() {
    document.querySelector<HTMLElement>('.wishlist-button')?.click();
  }
}
