# Amp for Bandcamp - Browser Extension

A multi-browser extension (Chrome, Firefox, Safari) that amplifies Bandcamp functionality with playback controls and UI improvements.

<a href="https://apps.apple.com/pl/app/amp-for-bandcamp/id6745343456"><img src="https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg" alt="Download on the App Store" width="160" height="55"></a>
<a href="https://chromewebstore.google.com/detail/amp-for-bandcamp/gjmlgkbcolbleloakpcfhfaodldlheld"><img src="https://developer.chrome.com/static/docs/webstore/branding/image/206x58-chrome-web-bcb82d15b2486.png" alt="Available in the Chrome Web Store" width="206" height="55"></a>
<a href="https://addons.mozilla.org/en-US/firefox/addon/amp-for-bandcamp/"><img src="https://blog.mozilla.org/addons/files/2020/04/get-the-addon-fx-apr-2020.svg" alt="Get the Add-On for Firefox" width="165" height="55"></a>

> **Disclaimer**: This extension is not affiliated with, endorsed by, or connected to Bandcamp. It is an independent project designed to enhance the user experience on Bandcamp.


## Features

- Auto-play next song when current song ends
- Sticky inline player that stays visible as you scroll on the album page
- Progress bar for currently playing track on feed and discover pages
- Support for album, collection, feed, and discover pages
- Keyboard shortcuts for playback control:
  - **Space**: Play/pause
  - **Up Arrow**: Next track
  - **Down Arrow**: Previous track
  - **Right Arrow**: Fast forward
  - **Left Arrow**: Rewind
  - **w**: Add a current song to the wishlist

## Building

This project includes npm scripts to help with building the extension for different browsers.

### Prerequisites

- Node.js (for running build scripts)
- Xcode (for Safari extension)
- zip command-line utility (for Chrome/Firefox packages)

### Setup and Build

```bash
# Install packages and playwright dependencies
npm i
npx playwright install

# Build for all platforms
npm run build

# Build ZIP file for Chrome/Firefox
npm run build:zip

# Build Safari extension with xcodebuild
npm run build:safari
```

All build artifacts will be placed in the `dist` directory:
- `dist/amp-for-bandcamp.zip` - Chrome/Opera/Edge/Firefox extension package
- `dist/safari` - Safari build output (compiled extension)

## Installation (from sources)

After finishing the "build" step from the above, you can now proceed to the installation step.

### Chrome/Edge/Opera
1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top-right corner)
4. Click "Load unpacked" and select the extension directory
5. The extension should now be installed and active

### Firefox
1. Download or clone this repository
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on..."
4. Select any file in the extension directory
5. The extension should now be installed and active (note: this is temporary and will be removed when Firefox is closed)

### Safari
1. Download or clone this repository
2. Install Xcode from the Mac App Store
3. Open the Xcode project:
   ```bash
   open "safari/Amp for Bandcamp.xcodeproj"
   ```
4. Build and run the project in Xcode
5. Enable the extension in Safari preferences:
   - Safari > Settings > Extensions
   - Check the box next to "Amp for Bandcamp"

## Testing

The extension uses [Playwright](https://playwright.dev/) for end-to-end testing. The tests verify that the core functionality works correctly on different Bandcamp pages.

### Running Tests

```bash
# Run all tests
npm test

# Run tests with interactive UI
npm run test:ui

# Run tests in debug mode
npm run test:debug
```
