import { FloatingPlayerPage } from './FloatingPlayerPage';

/**
 * bandcamp.com/discover (Vue app rooted at #DiscoverApp).
 *
 * On top of the shared floating player, the page has:
 *  - `.results-grid` – the results; up/down move through them in grid order.
 *  - `.static-player` – the "focused result" panel above the grid; it shows
 *                       the track the user clicked, even after the native
 *                       player has moved on to the next one.
 */
export class DiscoverPage extends FloatingPlayerPage {
  static override isMatch() {
    return !!document.querySelector<HTMLElement>('#DiscoverApp');
  }

  override togglePlayPause() {
    const button =
      this._getBarElement('.play-pause-button') ??
      document.querySelector<HTMLElement>(
        '.static-player .play-pause-button',
      ) ??
      document.querySelector<HTMLElement>(
        '.results-grid-item .play-pause-button',
      );
    button?.click();
  }

  override nextSong() {
    this._playSibling('nextElementSibling', () => super.nextSong());
  }

  override prevSong() {
    this._playSibling('previousElementSibling', () => super.prevSong());
  }

  override openCurrentTrack() {
    const link = this._getCurrentGridItem()?.querySelector<HTMLAnchorElement>(
      'a[href*="/album/"], a[href*="/track/"]',
    );
    if (link) {
      window.open(link.href, '_blank');
    } else {
      super.openCurrentTrack();
    }
  }

  override addToWishlist() {
    const button =
      this._getBarElement('.wishlist-button') ??
      document.querySelector<HTMLElement>('.wishlist-button');
    button?.click();
  }

  /**
   * Plays the grid item adjacent to the current one, scrolling it into view.
   * Falls back to the player's own skip when there is no adjacent item (or
   * the current one cannot be located).
   */
  _playSibling(
    direction: 'nextElementSibling' | 'previousElementSibling',
    fallback: () => void,
  ) {
    const sibling = this._getCurrentGridItem()?.[direction];
    const button = sibling?.querySelector<HTMLElement>('.play-pause-button');
    if (button) {
      button.click();
      button.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    fallback();
  }

  /**
   * The grid item whose track is loaded in the player. While playing, its
   * button is labelled "Pause"; while paused, we match the floating player's
   * album/track link against the grid instead.
   */
  _getCurrentGridItem(): HTMLElement | null {
    const playing = document
      .querySelector<HTMLElement>(
        '.results-grid-item .play-pause-button[aria-label="Pause"]',
      )
      ?.closest<HTMLElement>('.results-grid-item');
    if (playing) return playing;

    const playerLink = this._getBarElement<HTMLAnchorElement>(
      '.track-meta a:is([href*="/album/"], [href*="/track/"])',
    );
    if (!playerLink) return null;
    const target = this._itemKey(playerLink.href);

    for (const item of document.querySelectorAll<HTMLElement>(
      '.results-grid-item',
    )) {
      const link = item.querySelector<HTMLAnchorElement>(
        'a[href*="/album/"], a[href*="/track/"]',
      );
      if (link && this._itemKey(link.href) === target) return item;
    }
    return null;
  }
}
