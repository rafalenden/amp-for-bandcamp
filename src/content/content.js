async function init() {
  try {
    const { DEFAULT_SETTINGS } = await import(
      browser.runtime.getURL('src/constants.js')
    );
    const { AlbumPage } = await import(
      browser.runtime.getURL('src/content-pages/AlbumPage.js')
    );
    const { CollectionPage } = await import(
      browser.runtime.getURL('src/content-pages/CollectionPage.js')
    );
    const { FeedPage } = await import(
      browser.runtime.getURL('src/content-pages/FeedPage.js')
    );
    const { DiscoverPage } = await import(
      browser.runtime.getURL('src/content-pages/DiscoverPage.js')
    );

    const settings = await browser.storage.sync.get(DEFAULT_SETTINGS);

    if (AlbumPage.isMatch()) {
      new AlbumPage(settings).init();
    } else if (CollectionPage.isMatch()) {
      new CollectionPage(settings).init();
    } else if (FeedPage.isMatch()) {
      new FeedPage(settings).init();
    } else if (DiscoverPage.isMatch()) {
      new DiscoverPage(settings).init();
    }
  } catch (error) {
    console.error('[amp-for-bandcamp] Error initializing extension:', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
