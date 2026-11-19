import { chromium } from '@playwright/test';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, renameSync, rmSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * On macOS, Chromium registers as a regular Dock app for a moment on every
 * launch before headless mode hides it, so each test makes the Dock jump.
 * This prepares a copy of Playwright's Chromium marked `LSBackgroundOnly`, so
 * it never appears in the Dock, and hands its path to the test fixtures.
 *
 * The copy is an APFS clone (no extra disk space) cached per Chromium build.
 * Set SHOW_TEST_BROWSER_IN_DOCK=1 to use Playwright's stock Chromium.
 */
export default function globalSetup() {
  if (
    process.platform !== 'darwin' ||
    process.env.SHOW_TEST_BROWSER_IN_DOCK ||
    process.env.BROWSER_CHANNEL
  ) {
    return;
  }

  try {
    process.env.HIDDEN_CHROMIUM_PATH = prepareHiddenChromium();
  } catch (error) {
    console.warn(
      '[tests] Could not prepare a Dock-hidden Chromium; using the stock one.',
      error,
    );
  }
}

function prepareHiddenChromium() {
  const executable = chromium.executablePath();
  const appEnd = executable.indexOf('.app/') + '.app'.length;
  const sourceApp = executable.slice(0, appEnd);
  const relativeExecutable = executable.slice(appEnd + 1);
  // e.g. ".../ms-playwright/chromium-1248/chrome-mac-arm64/X.app" → "chromium-1248"
  const build = path.basename(path.dirname(path.dirname(sourceApp)));

  const root = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'node_modules',
    '.cache',
    'amp-for-bandcamp',
    'hidden-chromium',
  );
  const app = path.join(root, build, path.basename(sourceApp));
  const target = path.join(app, relativeExecutable);
  if (existsSync(target)) return target;

  // Build in a temporary folder and move it into place, so an interrupted run
  // never leaves a half-made copy behind.
  const staging = path.join(root, `${build}.tmp-${process.pid}`);
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  const staged = path.join(staging, path.basename(sourceApp));
  try {
    execFileSync('cp', ['-Rc', sourceApp, staging]);
  } catch {
    execFileSync('cp', ['-R', sourceApp, staging]); // not on APFS
  }
  // LSUIElement would also hide it, but Chromium reads that key as "I am a
  // helper process" and then fails to find its own resources.
  execFileSync('/usr/libexec/PlistBuddy', [
    '-c',
    'Add :LSBackgroundOnly bool true',
    path.join(staged, 'Contents', 'Info.plist'),
  ]);
  // Editing Info.plist breaks the bundle seal; re-sign it ad hoc.
  execFileSync('codesign', ['--force', '--sign', '-', staged], {
    stdio: 'ignore',
  });

  rmSync(path.dirname(app), { recursive: true, force: true });
  mkdirSync(path.dirname(app), { recursive: true });
  renameSync(staged, app);
  rmSync(staging, { recursive: true, force: true });
  return target;
}
