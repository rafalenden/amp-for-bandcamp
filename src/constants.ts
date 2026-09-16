export const MAX_SEEK_DURATION = 120;

export const DEFAULT_SETTINGS = {
  stickyPlayer: true,
  autoPlayNext: true,
  seekSeconds: 30,
  showLeaveWarning: true,
  showProgressBar: true,
  enableKeyboardShortcuts: true,
  volume: 100,
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
