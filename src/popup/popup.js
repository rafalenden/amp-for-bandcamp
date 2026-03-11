import { DEFAULT_SETTINGS, MAX_SEEK_DURATION } from '../constants.js';

const stickyPlayerToggle = document.getElementById('stickyPlayer');
const autoPlayNextToggle = document.getElementById('autoPlayNext');
const showLeaveWarningToggle = document.getElementById('showLeaveWarning');
const showProgressBarToggle = document.getElementById('showProgressBar');
const enableKeyboardShortcutsToggle = document.getElementById(
  'enableKeyboardShortcuts',
);
const showBpmToggle = document.getElementById('showBpm');
const seekSecondsInput = document.getElementById('seekSeconds');
const seekSecondsValue = document.getElementById('seekSecondsValue');
const volumeSlider = document.getElementById('volumeSlider');
const volumeValue = document.getElementById('volumeValue');
const keyboardShortcutsSection = document.getElementById(
  'keyboardShortcutsSection',
);
const seekDurationSection = document.getElementById('seekDurationSection');

seekSecondsInput.setAttribute('max', MAX_SEEK_DURATION);

function updateKeyboardShortcutsVisibility(enabled) {
  keyboardShortcutsSection.style.display = enabled ? '' : 'none';
  seekDurationSection.style.display = enabled ? '' : 'none';
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
      showBpmToggle.checked = items.showBpm;
      seekSecondsInput.value = items.seekSeconds;
      seekSecondsValue.textContent = `${items.seekSeconds}s`;
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

showBpmToggle.addEventListener('change', () => {
  browser.storage.sync
    .set({ showBpm: showBpmToggle.checked })
    .catch(console.error);
});

enableKeyboardShortcutsToggle.addEventListener('change', () => {
  const enabled = enableKeyboardShortcutsToggle.checked;
  browser.storage.sync
    .set({ enableKeyboardShortcuts: enabled })
    .catch(console.error);
  updateKeyboardShortcutsVisibility(enabled);
});

seekSecondsInput.addEventListener('input', () => {
  const value = Math.min(
    Math.max(parseInt(seekSecondsInput.value) || 30, 5),
    MAX_SEEK_DURATION,
  );
  seekSecondsInput.value = value;
  seekSecondsValue.textContent = `${value}s`;
  browser.storage.sync.set({ seekSeconds: value }).catch(console.error);
});

volumeSlider.addEventListener('input', () => {
  const value = parseInt(volumeSlider.value);
  volumeValue.textContent = `${value}%`;
  browser.storage.sync.set({ volume: value }).catch(console.error);
});
