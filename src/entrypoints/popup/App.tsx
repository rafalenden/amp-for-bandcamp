import { Fragment, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import {
  DEFAULT_SETTINGS,
  MAX_SEEK_DURATION,
  mergeSettings,
  type Settings,
  type SettingsChanges,
} from '../../constants';

const toggles = [
  [
    'showLeaveWarning',
    'leave-warning',
    'Warn when leaving the site during playback',
  ],
  ['stickyPlayer', 'sticky-player', 'Pin player to the top of the album page'],
  ['autoPlayNext', 'auto-play-next', 'Play next track automatically'],
  ['showProgressBar', 'progress-bar', 'Show progress bar on supported pages'],
  ['showBpm', 'bpm', 'Show BPM on album pages'],
  [
    'enableKeyboardShortcuts',
    'keyboard-shortcuts',
    'Enable keyboard shortcuts',
  ],
] as const;

const shortcuts = [
  ['space', 'Play/pause'],
  ['↑', 'Previous track'],
  ['↓', 'Next track'],
  ['→', 'Seek forward'],
  ['←', 'Seek backward'],
  ['w', 'Add track to wishlist'],
  ['enter', 'Open track in a new tab'],
];

export function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const onChanged = (changes: SettingsChanges, area: string) => {
      if (area === 'sync')
        setSettings((previous) => mergeSettings(previous, changes));
    };
    browser.storage.onChanged.addListener(onChanged);
    browser.storage.sync
      .get(DEFAULT_SETTINGS)
      .then((items) => {
        if (active) {
          setSettings(items as Settings);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (active)
          setError('Could not load settings. Please reopen the popup.');
      });
    return () => {
      active = false;
      browser.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((previous) => ({ ...previous, [key]: value }));
    setError(null);
    browser.storage.sync.set({ [key]: value }).catch(() => {
      setError('Could not save settings. Please try again.');
    });
  }

  return (
    <>
      <h1>Amp for Bandcamp</h1>
      {error && <p role="alert">{error}</p>}
      <fieldset className="settings" disabled={!loaded}>
        <legend>Settings</legend>
        <label className="settings-slider">
          Track volume <span id="volumeValue">{settings.volume}%</span>
          <input
            type="range"
            id="volumeSlider"
            min={0}
            max={100}
            step={1}
            value={settings.volume}
            onChange={(event) => update('volume', Number(event.target.value))}
          />
        </label>
        {settings.enableKeyboardShortcuts && (
          <label id="seekDurationSection" className="settings-slider">
            Seek duration{' '}
            <span id="seekSecondsValue">{settings.seekSeconds}s</span>
            <input
              type="range"
              id="seekSeconds"
              min={5}
              max={MAX_SEEK_DURATION}
              step={5}
              value={settings.seekSeconds}
              onChange={(event) =>
                update('seekSeconds', Number(event.target.value))
              }
            />
          </label>
        )}
        {toggles.map(([key, className, label]) => (
          <label key={key} className={`settings-${className}`}>
            <input
              type="checkbox"
              id={key}
              checked={settings[key]}
              onChange={(event) => update(key, event.target.checked)}
            />
            {label}
            {key === 'showProgressBar' && (
              <span
                className="settings-help"
                title="Currently, the custom progress bar is supported on the feed and album pages (for related tracks)."
              >
                i
              </span>
            )}
          </label>
        ))}
      </fieldset>
      {settings.enableKeyboardShortcuts && (
        <fieldset className="shortcuts" id="keyboardShortcutsSection">
          <legend>Keyboard Shortcuts</legend>
          <dl>
            {shortcuts.map(([key, description]) => (
              <Fragment key={key}>
                <dt>
                  <kbd>{key}</kbd>
                </dt>
                <dd>{description}</dd>
              </Fragment>
            ))}
          </dl>
        </fieldset>
      )}
    </>
  );
}
