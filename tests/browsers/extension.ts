import type { BrowserContext, Frame, Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

/** An extension page: a tab in Chromium and WebKit, a frame in Firefox. */
export type ExtensionPage = Page | Frame;

export type AudioResponse = {
  status?: number;
  contentType?: string;
  body?: string | Buffer;
};

/** Answers one audio request made by the background script. */
export type AudioHandler = (
  url: string,
) => AudioResponse | Promise<AudioResponse>;

/** What the tests need from the extension, however the browser loads it. */
export type Extension = {
  openPopup(): Promise<ExtensionPage>;
  /**
   * Opens the BPM analyzer page on its own, where it stays idle. It is the
   * only page the background script accepts audio requests from.
   */
  openAnalyzer(): Promise<ExtensionPage>;
  /** Writes raw values to sync storage. */
  setStorage(values: object): Promise<void>;
  removeStorage(key: string): Promise<void>;
  /**
   * Serves the audio that the background script downloads from `*.bcbits.com`.
   * Pages asking for the same URLs are refused, so a test that gets audio
   * knows it came through the background script.
   */
  routeAudio(handler: AudioHandler): Promise<void>;
};

export type LoadedExtension = {
  context: BrowserContext;
  extension: Extension;
  close(): Promise<void>;
};

type Chrome = {
  chrome: {
    storage: {
      sync: {
        set(values: object): Promise<void>;
        remove(key: string): Promise<void>;
      };
    };
  };
};

// Storage calls for Playwright to run inside an extension page or worker.
export const setInStorage = (values: object) =>
  (globalThis as unknown as Chrome).chrome.storage.sync.set(values);
export const removeFromStorage = (key: string) =>
  (globalThis as unknown as Chrome).chrome.storage.sync.remove(key);

export const AUDIO_URL = /^https:\/\/[^/]+\.bcbits\.com\//;

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** A build made by `npm run build`. */
export function buildPath(browser: 'chrome' | 'firefox' | 'safari') {
  return path.join(root, '.output', `${browser}-mv3`);
}

/** Files prepared for the tests, kept between runs. */
export const cachePath = path.join(
  root,
  'node_modules',
  '.cache',
  'amp-for-bandcamp',
);
