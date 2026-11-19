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

function SpeakerIcon({ silent }: { silent: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" />
      {silent ? (
        <path d="m23 9-6 6M17 9l6 6" />
      ) : (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 5.5a9 9 0 0 1 0 13" />
        </>
      )}
    </svg>
  );
}

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

  // Browsers focus the first control when the popup opens, which leaves a
  // focus ring on the mute button. Drop that automatic focus, but only until
  // the user interacts, so Tab and clicks still focus normally.
  useEffect(() => {
    const blur = () => {
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
    };
    const stop = () => {
      window.clearTimeout(timer);
      document.removeEventListener('focusin', blur);
      document.removeEventListener('keydown', stop, true);
      document.removeEventListener('pointerdown', stop, true);
    };
    const timer = window.setTimeout(stop, 1000);
    document.addEventListener('focusin', blur);
    document.addEventListener('keydown', stop, true);
    document.addEventListener('pointerdown', stop, true);
    blur();
    return stop;
  }, []);

  function update(changes: Partial<Settings>) {
    setSettings((previous) => ({ ...previous, ...changes }));
    setError(null);
    browser.storage.sync.set(changes).catch(() => {
      setError('Could not save settings. Please try again.');
    });
  }

  // While muted the slider reads 0; the chosen volume is kept for unmuting.
  const effectiveVolume = settings.muted ? 0 : settings.volume;

  return (
    <>
      <h1>Amp for Bandcamp</h1>
      {error && <p role="alert">{error}</p>}
      <fieldset className="settings" disabled={!loaded}>
        <legend>Settings</legend>
        <div className="settings-slider settings-volume">
          <label htmlFor="volumeSlider">Track volume</label>
          <button
            type="button"
            id="muteButton"
            className="mute-button"
            aria-pressed={settings.muted}
            aria-label={settings.muted ? 'Unmute' : 'Mute'}
            title={settings.muted ? 'Unmute' : 'Mute'}
            onClick={() => update({ muted: !settings.muted })}
          >
            <SpeakerIcon silent={effectiveVolume === 0} />
          </button>
          <span id="volumeValue">{effectiveVolume}%</span>
          <input
            type="range"
            id="volumeSlider"
            min={0}
            max={100}
            step={1}
            value={effectiveVolume}
            onChange={(event) =>
              update({ volume: Number(event.target.value), muted: false })
            }
          />
        </div>
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
                update({ seekSeconds: Number(event.target.value) })
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
              onChange={(event) => update({ [key]: event.target.checked })}
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
