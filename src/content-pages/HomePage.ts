import { FloatingPlayerPage } from './FloatingPlayerPage';

/**
 * bandcamp.com (Vue app rooted at #HomepageApp).
 *
 * The carousels (playlists, radio shows, new and notable, album of the day)
 * all play through the shared floating player, which stays empty until the
 * visitor starts something.
 */
export class HomePage extends FloatingPlayerPage {
  static override isMatch() {
    return !!document.querySelector<HTMLElement>('#HomepageApp');
  }

  /**
   * Most visitors are here to browse, so leave space and the arrow keys to
   * the page until the player has something loaded.
   */
  override hasPlayer() {
    return !!document.querySelector('.floating-player.has-track');
  }

  override nextSong() {
    this._skipAndScroll(() => super.nextSong());
  }

  override prevSong() {
    this._skipAndScroll(() => super.prevSong());
  }

  /**
   * Skips, then brings the new track into view: its card on the page (the
   * carousels do not follow the player) and its row in an open tracklist.
   * Bandcamp updates both shortly after the skip, so wait for them to move.
   */
  _skipAndScroll(skip: () => void) {
    const card = this._getCurrentCard();
    const row = this._getCurrentRow();
    skip();

    let attempts = 0;
    const timer = window.setInterval(() => {
      const newCard = this._getCurrentCard();
      const newRow = this._getCurrentRow();
      const cardMoved = !!newCard && newCard !== card;
      const rowMoved = !!newRow && newRow !== row;
      if (!cardMoved && !rowMoved && ++attempts < 40) return;
      clearInterval(timer);
      if (cardMoved) {
        this._getCarouselPageStart(newCard).scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'start',
        });
      }
      if (rowMoved) {
        newRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 50);
  }

  /**
   * The card whose track is loaded in the player. While playing, its button
   * is labelled "Pause"; while paused, match the bar's link against the cards.
   */
  _getCurrentCard(): HTMLElement | null {
    const playing = document
      .querySelector('.card-item .play-pause-button[aria-label="Pause"]')
      ?.closest<HTMLElement>('.card-item');
    if (playing) return playing;

    const barLink = this._getBarElement<HTMLAnchorElement>(
      '.track-meta a[href]',
    );
    if (!barLink) return null;
    const target = this._itemKey(barLink.href);
    for (const link of document.querySelectorAll<HTMLAnchorElement>(
      '.card-item .header a[href]',
    )) {
      if (this._itemKey(link.href) === target) {
        return link.closest<HTMLElement>('.card-item');
      }
    }
    return null;
  }

  /**
   * Carousels snap to pages, so scrolling one to an arbitrary card snaps
   * straight back. Aim for the card that starts the page instead.
   */
  _getCarouselPageStart(card: HTMLElement) {
    let start: Element | null = card;
    while (start && !start.classList.contains('carousel-page-start')) {
      start = start.previousElementSibling;
    }
    return start ?? card;
  }

  _getCurrentRow() {
    return document.querySelector<HTMLElement>(
      '.floating-player .track-list-item.currently-playing',
    );
  }

  override openCurrentTrack() {
    if (this._getBarElement('.track-meta a[href]')) {
      super.openCurrentTrack();
      return;
    }

    // Radio shows have no link in the bar: open the card they were started from.
    const tracklist =
      this._getBarElement('.play-pause-button')?.getAttribute('tracklistkey');
    if (!tracklist) return;
    for (const button of document.querySelectorAll(
      '.card-item .play-pause-button',
    )) {
      if (button.getAttribute('tracklistkey') !== tracklist) continue;
      const link = button
        .closest('.card-item')
        ?.querySelector<HTMLAnchorElement>('.header a[href]');
      if (link) {
        window.open(link.href, '_blank');
        return;
      }
    }
  }
}
