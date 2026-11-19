export const MAX_SEEK_DURATION = 120;

export const DEFAULT_SETTINGS = {
  stickyPlayer: true,
  autoPlayNext: true,
  seekSeconds: 30,
  showLeaveWarning: true,
  showProgressBar: true,
  enableKeyboardShortcuts: true,
  volume: 100,
  muted: false,
  showBpm: true,
};

export type Settings = typeof DEFAULT_SETTINGS;
export type SettingsChanges = Partial<
  Record<keyof Settings, { newValue?: unknown; oldValue?: unknown }>
>;

export function mergeSettings(
  settings: Settings,
  changes: SettingsChanges,
): Settings {
  const next = { ...settings };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const change = changes[key];
    if (!change) continue;
    const value = change.newValue ?? DEFAULT_SETTINGS[key];
    if (typeof value === typeof DEFAULT_SETTINGS[key]) {
      Object.assign(next, { [key]: value });
    }
  }
  return next;
}

/**
 * Protocol between content scripts and the page-world audio hook
 * (`entrypoints/audio-hook.ts`). Both sides share the DOM but not JS objects,
 * so state travels through `<html>` data attributes and `window.postMessage`.
 */
export const AUDIO_HOOK = {
  /** `postMessage` payload marker. */
  source: 'amp-for-bandcamp',
  /** Set on `<html>` by the hook once it holds the page's audio element. */
  readyAttr: 'ampAudioHook',
  /** Set on `<html>` by the content script: desired volume, 0–100. */
  volumeAttr: 'ampVolume',
} as const;

export type AudioHookMessage = {
  source: typeof AUDIO_HOOK.source;
  type: 'seek';
  /** Seconds relative to the current position. */
  delta: number;
};
