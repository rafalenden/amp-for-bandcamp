import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { DEFAULT_SETTINGS, type Settings } from '../constants';
import { AlbumPage } from '../content-pages/AlbumPage';
import { CollectionPage } from '../content-pages/CollectionPage';
import { FeedPage } from '../content-pages/FeedPage';
import { DiscoverPage } from '../content-pages/DiscoverPage';
import { LivePage } from '../content-pages/LivePage';
import '../content/content.css';

export default defineContentScript({
  matches: ['*://*.bandcamp.com/*'],
  runAt: 'document_idle',
  async main() {
    try {
      const settings = (await browser.storage.sync.get(
        DEFAULT_SETTINGS,
      )) as Settings;
      const Page = [
        LivePage,
        AlbumPage,
        CollectionPage,
        FeedPage,
        DiscoverPage,
      ].find((page) => page.isMatch());
      if (Page) new Page(settings).init();
    } catch (error) {
      console.error('[amp-for-bandcamp] Error initializing extension:', error);
    }
  },
});
