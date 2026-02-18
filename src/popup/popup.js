import { DEFAULT_SETTINGS, MAX_SEEK_DURATION } from '../constants.js';

const stickyPlayerToggle = document.getElementById('stickyPlayer');
const autoPlayNextToggle = document.getElementById('autoPlayNext');
const showLeaveWarningToggle = document.getElementById('showLeaveWarning');
const showProgressBarToggle = document.getElementById('showProgressBar');
const enableKeyboardShortcutsToggle = document.getElementById(
  'enableKeyboardShortcuts',
);
const seekSecondsInput = document.getElementById('seekSeconds');
const volumeSlider = document.getElementById('volumeSlider');
const volumeValue = document.getElementById('volumeValue');
const keyboardShortcutsSection = document.getElementById(
  'keyboardShortcutsSection',
);
const seekDurationSection = document.getElementById('seekDurationSection');

function updateKeyboardShortcutsVisibility(enabled) {
  keyboardShortcutsSection.style.display = enabled ? 'block' : 'none';
  seekDurationSection.style.display = enabled ? 'block' : 'none';
}

document.addEventListener('DOMContentLoaded', () => {
  browser.storage.sync
    .get(DEFAULT_SETTINGS)
    .then((items) => {
      stickyPlayerToggle.checked = items.stickyPlayer;
      autoPlayNextToggle.checked = items.autoPlayNext;
      showLeaveWarningToggle.checked = items.showLeaveWarning;
      showProgressBarToggle.checked = items.showProgressBar;
      enableKeyboardShortcutsToggle.checked = items.enableKeyboardShortcuts;
      seekSecondsInput.value = items.seekSeconds;
      seekSecondsInput.setAttribute('max', MAX_SEEK_DURATION);
      volumeSlider.value = items.volume;
      volumeValue.textContent = `${items.volume}%`;
      updateKeyboardShortcutsVisibility(items.enableKeyboardShortcuts);
    })
    .catch(console.error);
});

stickyPlayerToggle.addEventListener('change', () => {
  browser.storage.sync
    .set({ stickyPlayer: stickyPlayerToggle.checked })
    .catch(console.error);
});

autoPlayNextToggle.addEventListener('change', () => {
  browser.storage.sync
    .set({ autoPlayNext: autoPlayNextToggle.checked })
    .catch(console.error);
});

showLeaveWarningToggle.addEventListener('change', () => {
  browser.storage.sync
    .set({ showLeaveWarning: showLeaveWarningToggle.checked })
    .catch(console.error);
});

showProgressBarToggle.addEventListener('change', () => {
  browser.storage.sync
    .set({ showProgressBar: showProgressBarToggle.checked })
    .catch(console.error);
});

enableKeyboardShortcutsToggle.addEventListener('change', () => {
  const enabled = enableKeyboardShortcutsToggle.checked;
  browser.storage.sync
    .set({ enableKeyboardShortcuts: enabled })
    .catch(console.error);
  updateKeyboardShortcutsVisibility(enabled);
});

seekSecondsInput.addEventListener('change', () => {
  const value = Math.min(
    Math.max(parseInt(seekSecondsInput.value) || 30, 5),
    MAX_SEEK_DURATION,
  );
  seekSecondsInput.value = value;
  browser.storage.sync.set({ seekSeconds: value }).catch(console.error);
});

volumeSlider.addEventListener('input', () => {
  const value = parseInt(volumeSlider.value);
  volumeValue.textContent = `${value}%`;
  browser.storage.sync.set({ volume: value }).catch(console.error);
});
