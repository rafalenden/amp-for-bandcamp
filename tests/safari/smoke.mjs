// Smoke test for the Safari build in Safari itself, driven through safaridriver.
// Playwright cannot drive Safari, so this stays apart from the Playwright specs.
//
// It opens a Safari window (Safari cannot run headless), and needs Safari 26
// or later with "Allow remote automation" on (Safari Settings, Developer).
// The fixture page is served from this machine as `amp-test.bandcamp.com`:
//
//   echo '127.0.0.1 amp-test.bandcamp.com' | sudo tee -a /etc/hosts
//
// With SAFARI_LIVE=1 it visits a real Bandcamp album instead, which needs no
// hosts entry. SAFARI_DIAGNOSE=1 makes safaridriver log each request to
// ~/Library/Logs/com.apple.WebDriver, and SAFARI_SCREENSHOT=<file> saves a
// picture of the screen when the test fails.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXTENSION = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../.output/safari-mv3',
);
const FIXTURE_HOST = 'amp-test.bandcamp.com';
const LIVE_ALBUM = 'https://aimedrec.bandcamp.com/album/aimed-001';
const DRIVER_PORT = 4723;
// WebDriver's code for the Space key; safaridriver mistypes a literal space.
const SPACE = '\uE00D';
const live = !!process.env.SAFARI_LIVE;

// What the test adds to the background script of the copy it loads:
// - Safari gives an extension no access to a site until the user allows it,
//   and nobody can answer that prompt in an automation window. Under
//   automation it does give access once the background script asks about the
//   tab, which this extension never does.
// - Safari refuses to open a `safari-web-extension://` URL the test navigates
//   to, but lets the extension open its own page in a tab.
const testBackground = (port) => `
;(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const timer = setInterval(async () => {
    api.tabs.query({});
    const response = await fetch('http://127.0.0.1:${port}/open-popup');
    if ((await response.text()) !== 'yes') return;
    clearInterval(timer);
    setInterval(() => api.tabs.query({}), 500);
    api.tabs.create({ url: api.runtime.getURL('/popup.html') });
  }, 500);
})();`;

// Safari may still ask for access in a dialog, which stops WebDriver until it
// is answered. With SAFARI_ANSWER_PROMPT=1 the test presses "Always Allow"
// through System Events, which needs the Accessibility permission that
// GitHub's runners have.
const PRESS_ALWAYS_ALLOW = `
  tell application "System Events" to tell process "Safari"
    repeat with safariWindow in windows
      try
        click (first button of safariWindow whose name is "Always Allow")
        return "pressed"
      end try
      try
        click (first button of sheet 1 of safariWindow whose name is "Always Allow")
        return "pressed"
      end try
    end repeat
  end tell`;

// Lists what System Events can see of Safari, to find a dialog's buttons.
function describeWindows() {
  const queries = [
    'name',
    'subrole',
    'role of every UI element',
    'name of every button',
    'description of every button',
    'role of every UI element of every UI element',
    'name of every button of every UI element',
    'name of every button of every UI element of every UI element',
    'count of sheets',
  ];
  let found = '';
  for (const window of [1, 2, 3])
    for (const query of queries) {
      const { stdout, stderr } = spawnSync(
        'osascript',
        [
          '-e',
          `tell application "System Events" to tell process "Safari" to get ${query} of window ${window}`,
        ],
        { timeout: 20_000, encoding: 'utf8' },
      );
      found += `window ${window}, ${query}: ${stdout.trim()} ${stderr.trim()}\n`;
    }
  return found;
}

function answerAccessPrompts() {
  let busy = false;
  return setInterval(() => {
    if (busy) return;
    busy = true;
    const script = spawn('osascript', ['-e', PRESS_ALWAYS_ALLOW]);
    let output = '';
    script.stdout.on('data', (data) => (output += data));
    script.stderr.on('data', (data) => (output += data));
    script.on('close', () => {
      busy = false;
      if (output.trim()) console.log(`  access prompt: ${output.trim()}`);
    });
  }, 1000);
}

function copyExtensionForTest(port) {
  const copy = mkdtempSync(path.join(tmpdir(), 'amp-safari-'));
  cpSync(EXTENSION, copy, { recursive: true });
  appendFileSync(path.join(copy, 'background.js'), testBackground(port));
  return copy;
}

const PAGES = {
  '/album/test': `
    <div class="inline_player"><span class="time">0:00</span></div>
    <audio preload="auto" src="/audio.wav"></audio>`,
};

function silentWav(seconds = 90) {
  const samples = 8000 * seconds;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(samples * 2, 40);
  return wav;
}

/** Serves the fixture pages and takes the extension's report of its URL. */
async function startServer() {
  const wav = silentWav();
  const server = createServer((request, response) => {
    const { pathname } = new URL(request.url, 'http://localhost');
    if (pathname === '/open-popup') {
      response
        .writeHead(200, { 'Access-Control-Allow-Origin': '*' })
        .end(server.openPopup ? 'yes' : 'no');
    } else if (pathname.endsWith('.wav')) {
      const range = /bytes=(\d+)-(\d*)/.exec(request.headers.range ?? '');
      const start = Number(range?.[1] ?? 0);
      const end = range?.[2] ? Number(range[2]) : wav.length - 1;
      response.writeHead(range ? 206 : 200, {
        'Content-Type': 'audio/wav',
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        ...(range
          ? { 'Content-Range': `bytes ${start}-${end}/${wav.length}` }
          : {}),
      });
      response.end(wav.subarray(start, end + 1));
    } else if (PAGES[pathname]) {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(`<!doctype html><meta charset="utf-8">${PAGES[pathname]}`);
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function poll(description, check, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  let last;
  for (;;) {
    try {
      last = await check();
      if (last) return last;
    } catch (error) {
      last = error;
    }
    if (Date.now() > deadline)
      throw new Error(`Timed out waiting for ${description} (last: ${last})`);
    await sleep(250);
  }
}

async function webdriver(method, route, body) {
  const response = await fetch(`http://127.0.0.1:${DRIVER_PORT}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(60_000),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const { value } = await response.json();
  if (!response.ok)
    throw new Error(`${method} ${route}: ${value?.error}: ${value?.message}`);
  return value;
}

function step(name) {
  console.log(`- ${name}`);
}

const safaridriver = spawn(
  '/usr/bin/safaridriver',
  [
    '-p',
    String(DRIVER_PORT),
    ...(process.env.SAFARI_DIAGNOSE ? ['--diagnose'] : []),
  ],
  {
    stdio: 'inherit',
  },
);
let server;
let session;
let extension;
const prompts = process.env.SAFARI_ANSWER_PROMPT && answerAccessPrompts();

try {
  assert(existsSync(EXTENSION), `${EXTENSION} is missing: run npm run build`);

  server = await startServer();
  const { port } = server.address();
  let albumUrl = LIVE_ALBUM;
  if (!live) {
    const { address } = await lookup(FIXTURE_HOST).catch(() => ({}));
    assert.equal(
      address,
      '127.0.0.1',
      `${FIXTURE_HOST} must point at 127.0.0.1 in /etc/hosts`,
    );
    albumUrl = `http://${FIXTURE_HOST}:${port}/album/test`;
  }

  await poll('safaridriver', () =>
    fetch(`http://127.0.0.1:${DRIVER_PORT}/status`).then((r) => r.ok),
  );
  const created = await webdriver('POST', '/session', {
    capabilities: { alwaysMatch: { browserName: 'safari' } },
  });
  session = `/session/${created.sessionId}`;
  console.log(`Safari ${created.capabilities.browserVersion}`);

  const execute = (script, args = []) =>
    webdriver('POST', `${session}/execute/sync`, { script, args });
  const press = (key) =>
    webdriver('POST', `${session}/actions`, {
      actions: [
        {
          type: 'key',
          id: 'keyboard',
          actions: [
            { type: 'keyDown', value: key },
            { type: 'keyUp', value: key },
          ],
        },
      ],
    });
  const audio = () =>
    execute(`
      const audio = document.querySelector('audio');
      return audio && { paused: audio.paused, volume: audio.volume, duration: audio.duration };`);
  // The content script cancels the keys it handles; ArrowLeft is harmless.
  const shortcutsListening = () =>
    execute(`
      return !document.body.dispatchEvent(new KeyboardEvent('keydown', {
        code: 'ArrowLeft', bubbles: true, cancelable: true,
      }));`);

  step('Safari loads the extension');
  const loaded = await webdriver('POST', `${session}/webextension`, {
    type: 'path',
    path: (extension = copyExtensionForTest(port)),
  });
  console.log(`  ${JSON.stringify(loaded)}`);

  step('the content script runs on a bandcamp.com page');
  await webdriver('POST', `${session}/url`, { url: albumUrl });
  await poll('the content script', shortcutsListening);

  step('Space toggles playback');
  // A real album only loads its audio once it plays.
  await poll('the audio element', async () => {
    const state = await audio();
    return live ? !!state : state?.duration > 0;
  });
  assert.equal((await audio()).paused, true);
  await press(SPACE);
  await poll('playback to start', async () => !(await audio()).paused);
  await press(SPACE);
  await poll('playback to pause', async () => (await audio()).paused);

  step('the popup opens in a tab');
  const page = await webdriver('GET', `${session}/window`);
  server.openPopup = true;
  const popup = await poll('the popup tab', async () => {
    const handles = await webdriver('GET', `${session}/window/handles`);
    return handles.find((handle) => handle !== page);
  });
  await webdriver('POST', `${session}/window`, { handle: popup });
  console.log(`  ${await webdriver('GET', `${session}/url`)}`);
  await poll('the popup to load its settings', () =>
    execute(`
      const slider = document.querySelector('#volumeSlider');
      return !!slider && !slider.matches(':disabled');`),
  );

  step('a popup setting reaches the content script');
  // A click in the middle of the slider is a real change by the user.
  const slider = await webdriver('POST', `${session}/element`, {
    using: 'css selector',
    value: '#volumeSlider',
  });
  await webdriver(
    'POST',
    `${session}/element/${Object.values(slider)[0]}/click`,
    {},
  );
  const volume = await poll('the volume to change', () =>
    execute(`
      const value = Number(document.querySelector('#volumeSlider').value);
      return value < 100 && value;`),
  );
  console.log(`  volume set to ${volume}%`);
  await webdriver('POST', `${session}/window`, { handle: page });
  await poll(
    'the page volume to follow',
    async () => Math.abs((await audio()).volume - volume / 100) < 0.001,
  );

  console.log('Passed');
} catch (error) {
  console.error(`Failed: ${error.message}`);
  // A picture of the screen shows a dialog that WebDriver cannot report.
  if (process.env.SAFARI_SCREENSHOT) {
    mkdirSync(path.dirname(process.env.SAFARI_SCREENSHOT), { recursive: true });
    spawnSync('screencapture', ['-x', process.env.SAFARI_SCREENSHOT]);
    writeFileSync(`${process.env.SAFARI_SCREENSHOT}.txt`, describeWindows());
  }
  if (session)
    console.error(
      `  at ${await webdriver('GET', `${session}/url`).catch(() => 'an unknown page')}`,
    );
  process.exitCode = 1;
} finally {
  if (session) await webdriver('DELETE', session).catch(() => {});
  clearInterval(prompts);
  safaridriver.kill();
  server?.close();
  if (extension) rmSync(extension, { recursive: true, force: true });
}
