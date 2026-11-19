import { firefox, type Page } from '@playwright/test';
import { execFileSync } from 'child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import http from 'http';
import https from 'https';
import net, { type AddressInfo } from 'net';
import path from 'path';
import {
  AUDIO_URL,
  buildPath,
  cachePath,
  removeFromStorage,
  setInStorage,
  type AudioHandler,
  type ExtensionPage,
  type LoadedExtension,
} from './extension';

/**
 * Playwright cannot load extensions into Firefox, and its Firefox hangs when a
 * tab opens a `moz-extension://` page. So the tests:
 *
 * - install the build as a temporary add-on over Firefox's remote debugging
 *   protocol, as `about:debugging` does;
 * - show extension pages in a frame on a Bandcamp page, which needs a copy of
 *   the build whose manifest lets Bandcamp pages embed the popup too;
 * - send the browser through a local proxy to answer the background script's
 *   audio downloads, which Playwright's request routing does not see.
 */
const extensionCopy = path.join(cachePath, 'firefox-extension');
const certificate = path.join(cachePath, 'proxy-certificate');
const standInHome = path.join(cachePath, 'firefox-home');
const EXTENSION_ORIGIN = 'moz-extension://a3f1c0de-5b0d-4c5e-9f6a-0b0d0c0a0f0e';
const HOST_ORIGIN = 'https://amp-extension-pages.bandcamp.com';

/** Runs once per test run, before any Firefox test (see global-setup.ts). */
export function prepareFirefox() {
  rmSync(extensionCopy, { recursive: true, force: true });
  cpSync(buildPath('firefox'), extensionCopy, { recursive: true });
  const manifestPath = path.join(extensionCopy, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.web_accessible_resources[0].resources.push('popup.html');
  writeFileSync(manifestPath, JSON.stringify(manifest));

  if (!existsSync(`${certificate}.crt`)) {
    mkdirSync(cachePath, { recursive: true });
    // Firefox is told to accept any certificate, so a throwaway one will do.
    execFileSync(
      'openssl',
      [
        ...['req', '-x509', '-nodes', '-newkey', 'rsa:2048', '-days', '3650'],
        ...['-subj', '/CN=amp-for-bandcamp tests'],
        ...['-keyout', `${certificate}.key`, '-out', `${certificate}.crt`],
      ],
      { stdio: 'ignore' },
    );
  }
}

export async function loadInFirefox(): Promise<LoadedExtension> {
  const proxy = await startProxy();
  const debuggerPort = await freePort();
  // Playwright's Firefox reads the installed Firefox's profile list even when
  // given a profile of its own. macOS 27 denies that, and Firefox exits with
  // "Could not find profile folder". A stand-in home keeps it away.
  if (process.platform === 'darwin')
    mkdirSync(standInHome, { recursive: true });
  const { id } = JSON.parse(
    readFileSync(path.join(extensionCopy, 'manifest.json'), 'utf8'),
  ).browser_specific_settings.gecko;

  const context = await firefox.launchPersistentContext('', {
    args: ['-start-debugger-server', String(debuggerPort)],
    env: {
      ...(process.env as Record<string, string>),
      ...(process.platform === 'darwin'
        ? { CFFIXED_USER_HOME: standInHome }
        : {}),
    },
    proxy: { server: `http://127.0.0.1:${proxy.port}` },
    ignoreHTTPSErrors: true,
    firefoxUserPrefs: {
      'devtools.debugger.remote-enabled': true,
      'devtools.debugger.prompt-connection': false,
      // Firefox gives each install a random origin unless told otherwise.
      'extensions.webextensions.uuids': JSON.stringify({
        [id]: new URL(EXTENSION_ORIGIN).host,
      }),
    },
  });
  const close = async () => {
    await context.close();
    await proxy.close();
  };

  try {
    await installTemporaryAddon(debuggerPort, extensionCopy);
    await context.route(`${HOST_ORIGIN}/**`, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><iframe src="${EXTENSION_ORIGIN}${new URL(route.request().url()).pathname}"
          style="position: fixed; inset: 0; width: 100%; height: 100%; border: 0"></iframe>`,
      }),
    );
    const open = async (file: string, page?: Page) => {
      page ??= await context.newPage();
      await page.goto(`${HOST_ORIGIN}/${file}`);
      const frame = await page.locator('iframe').elementHandle();
      return (await frame!.contentFrame())!;
    };
    // Storage is only reachable from extension pages. Keeping one open from
    // the start means no tab appears in the middle of a test.
    const storage = await open('bpm-analyzer.html', context.pages()[0]);

    return {
      context,
      close,
      extension: {
        openPopup: (): Promise<ExtensionPage> => open('popup.html'),
        openAnalyzer: (): Promise<ExtensionPage> => open('bpm-analyzer.html'),
        async setStorage(values) {
          await storage.evaluate(setInStorage, values);
        },
        async removeStorage(key) {
          await storage.evaluate(removeFromStorage, key);
        },
        async routeAudio(handler) {
          proxy.serveAudio(handler);
          // Requests from pages do go through Playwright; only the background
          // script's reach the proxy.
          await context.route(AUDIO_URL, (route) => route.abort());
        },
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}

function listen(server: net.Server) {
  return new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () =>
      resolve((server.address() as AddressInfo).port),
    );
  });
}

async function freePort() {
  const server = net.createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

/**
 * Installs an unpacked extension the way `about:debugging` does. Messages of
 * the remote debugging protocol are JSON prefixed with their byte length.
 */
async function installTemporaryAddon(port: number, addonPath: string) {
  const socket = await connect(port);
  try {
    let received = Buffer.alloc(0);
    const replies: ((message: Record<string, unknown>) => void)[] = [];
    socket.on('data', (data) => {
      received = Buffer.concat([received, data]);
      for (;;) {
        const colon = received.indexOf(':');
        if (colon < 0) return;
        const end = colon + 1 + Number(received.subarray(0, colon));
        if (received.length < end) return;
        replies.shift()?.(
          JSON.parse(received.toString('utf8', colon + 1, end)),
        );
        received = received.subarray(end);
      }
    });
    const reply = () =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        replies.push(resolve);
        socket.once('close', () => reject(new Error('Firefox hung up')));
      });
    const request = (message: object) => {
      const json = JSON.stringify(message);
      socket.write(`${Buffer.byteLength(json)}:${json}`);
      return reply();
    };

    await reply(); // Firefox speaks first.
    const { addonsActor } = await request({ to: 'root', type: 'getRoot' });
    const result = await request({
      to: addonsActor,
      type: 'installTemporaryAddon',
      addonPath,
    });
    if (!result.addon) {
      throw new Error(
        `Firefox did not install the extension: ${JSON.stringify(result)}`,
      );
    }
  } finally {
    socket.destroy();
  }
}

/** Firefox opens the debugging port a moment after it starts. */
async function connect(port: number) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await new Promise<net.Socket>((resolve, reject) => {
        const socket = net.connect(port, '127.0.0.1');
        socket.once('connect', () => resolve(socket));
        socket.once('error', reject);
      });
    } catch (error) {
      if (attempt === 100) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

/**
 * An HTTP proxy that passes everything through, except that it answers HTTPS
 * requests to `*.bcbits.com` itself once a test has called `serveAudio`.
 */
async function startProxy() {
  let audio: AudioHandler | undefined;

  const answering = https.createServer(
    {
      key: readFileSync(`${certificate}.key`),
      cert: readFileSync(`${certificate}.crt`),
    },
    async (request, response) => {
      try {
        const host = request.headers.host!.replace(/:443$/, '');
        const { status, contentType, body } = await audio!(
          `https://${host}${request.url}`,
        );
        response.writeHead(
          status ?? 200,
          contentType ? { 'Content-Type': contentType } : {},
        );
        response.end(body);
      } catch {
        response.destroy();
      }
    },
  );
  const answeringPort = await listen(answering);

  const proxy = http.createServer((request, response) => {
    const upstream = http.request(
      request.url!,
      { method: request.method, headers: request.headers },
      (reply) => {
        response.writeHead(reply.statusCode!, reply.headers);
        reply.pipe(response);
      },
    );
    upstream.on('error', () => response.destroy());
    request.pipe(upstream);
  });
  const tunnels = new Set<net.Socket>();
  proxy.on('connect', (request, client: net.Socket, head: Buffer) => {
    const { hostname, port } = new URL(`https://${request.url}`);
    const upstream =
      audio && hostname.endsWith('.bcbits.com')
        ? net.connect(answeringPort, '127.0.0.1')
        : net.connect(Number(port) || 443, hostname);
    for (const socket of [client, upstream]) {
      tunnels.add(socket);
      socket.once('close', () => tunnels.delete(socket));
    }
    upstream.once('connect', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.on('error', () => client.destroy());
    client.on('error', () => upstream.destroy());
  });

  return {
    port: await listen(proxy),
    serveAudio(handler: AudioHandler) {
      audio = handler;
    },
    async close() {
      for (const socket of tunnels) socket.destroy();
      for (const server of [proxy, answering]) {
        server.close();
        server.closeAllConnections();
      }
    },
  };
}
