# Amp for Bandcamp - Browser Extension

A multi-browser extension (Chrome, Firefox, Safari) that amplifies Bandcamp functionality with playback controls and UI improvements.

<a href="https://apps.apple.com/pl/app/amp-for-bandcamp/id6745343456"><img src="https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg" alt="Download on the App Store" width="160" height="55"></a>
<a href="https://chromewebstore.google.com/detail/amp-for-bandcamp/gjmlgkbcolbleloakpcfhfaodldlheld"><img src="https://developer.chrome.com/static/docs/webstore/branding/image/206x58-chrome-web-bcb82d15b2486.png" alt="Available in the Chrome Web Store" width="206" height="55"></a>
<a href="https://addons.mozilla.org/en-US/firefox/addon/amp-for-bandcamp/"><img src="https://blog.mozilla.org/addons/files/2020/04/get-the-addon-fx-apr-2020.svg" alt="Get the Add-On for Firefox" width="165" height="55"></a>

> **Disclaimer**: This extension is not affiliated with, endorsed by, or connected to Bandcamp. It is an independent project designed to enhance the user experience on Bandcamp.


## Features

- Volume control slider
- Configurable seek duration
- Auto-play the next track when the current one ends
- Sticky mini-player that remains visible while scrolling on album pages
- Playback progress bar on feed and album pages
- BPM detection on album pages
- Warn when leaving the site during playback
- Keyboard shortcuts (play/pause, seek, next/previous, wishlist, open track)

## Development and building

Built with [WXT](https://wxt.dev/), TypeScript, and React. WXT generates the browser manifests and bundles the extension; the popup is a React app, and the content script contains the Bandcamp page controllers.

### Prerequisites

- Node.js 22.12 or newer and npm
- Xcode for the native Safari app

```bash
npm ci

# Start development with automatic rebuilds and browser reloads
npm run dev
npm run dev -- -b firefox     # Optional: develop in Firefox

# Check TypeScript
npm run compile

# Build Chrome/Edge/Opera, Firefox, and Safari together
npm run build

# Package for distribution
npm run build:zip             # Chrome and Firefox ZIPs in .output/
npm run build:safari          # Safari web build + native app in dist/safari
npm run build:all             # Both ZIPs + native Safari app
```

`npm run build` generates `.output/chrome-mv3`, `.output/firefox-mv3`, and `.output/safari-mv3` from the same source code. Browser-specific manifests are generated automatically. All targets use Manifest V3. Extension metadata and permissions live in `wxt.config.ts`; the version comes from `package.json`. Icons live in `public/icons`. Entrypoints are in `src/entrypoints`, with shared playback controllers in `src/content-pages`.

The Safari Xcode targets copy the compiled `.output/safari-mv3` contents into their extension resources. Run `npm run build:safari:web` after changing web code and before building directly in Xcode. Both macOS and iOS targets use that output.

## Installation (from sources)

After finishing the "build" step from the above, you can now proceed to the installation step.

### Chrome/Edge/Opera
1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top-right corner)
4. Click "Load unpacked" and select `.output/chrome-mv3`
5. The extension should now be installed and active

### Firefox
1. Download or clone this repository
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on..."
4. Select `.output/firefox-mv3/manifest.json`
5. The extension should now be installed and active (note: this is temporary and will be removed when Firefox is closed)

### Safari
1. Download or clone this repository
2. Install Xcode from the Mac App Store
3. Run `npm ci` and `npm run build:safari:web`, then open the Xcode project:
   ```bash
   open "safari/Amp for Bandcamp.xcodeproj"
   ```
4. Build and run the project in Xcode
5. Enable the extension in Safari preferences:
   - Safari > Settings > Extensions
   - Check the box next to "Amp for Bandcamp"

## Testing

The extension uses [Playwright](https://playwright.dev/) for end-to-end testing. Tests load the compiled extension from `.output/chrome-mv3`. They cover React popup persistence, live settings updates, and playback controls on a local page fixture. The album and collection smoke tests also visit real Bandcamp pages and require network access.

### Install Playwright Dependencies
```bash
npx playwright install chromium
```

### Running Tests

```bash
# Build and run all tests
npm test

# Run the local integration tests without depending on Bandcamp
npm test -- tests/Popup.spec.ts tests/Content.spec.ts

# Run tests with interactive UI
npm run test:ui

# Run tests in debug mode
npm run test:debug
```

## Safari releases with Xcode Cloud

The executable hook [`safari/ci_scripts/ci_post_clone.sh`](safari/ci_scripts/ci_post_clone.sh) lives alongside `safari/Amp for Bandcamp.xcodeproj`, where [Xcode Cloud discovers custom build scripts](https://developer.apple.com/documentation/xcode/writing-custom-build-scripts).

After checkout, the hook ensures Node.js 22.12 or newer is available (installing Node 22 with Homebrew if needed), installs the locked npm dependencies with `npm ci`, checks TypeScript, and builds only the Safari web extension into `.output/safari-mv3`. Any failed step stops the build. The existing Xcode build phases then copy the generated manifest, JavaScript, CSS, and icons into the macOS or iOS Safari extension during the native build/archive.

In Xcode Cloud, configure the Safari project's workflow with a branch-change start condition for your release branch and an Archive action for the appropriate app scheme. Configure signing and the desired App Store Connect/TestFlight distribution in that workflow. Commit and push the hook with the project changes; Xcode Cloud runs it automatically on subsequent builds. The hook prepares the web assets; Xcode Cloud handles the native archive and distribution.

## GitHub Actions CI

`npm run ci` checks TypeScript, builds all three browser bundles, and runs the local popup and playback integration tests. The GitHub Actions workflow installs npm dependencies and Playwright Chromium before running this command.

`npm run test:live` runs the separate smoke tests against the real Bandcamp album and collection pages. `npm test` runs all tests. These tests dismiss Bandcamp’s cookie dialog before checking playback and require access to the live site; offline CI runs the local integration tests.
