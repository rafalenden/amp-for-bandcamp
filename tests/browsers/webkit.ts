import { webkit, type Frame, type Request } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';
import {
  AUDIO_URL,
  buildPath,
  type ExtensionPage,
  type LoadedExtension,
} from './extension';

/**
 * Playwright's WebKit cannot load extensions, and Safari itself cannot be
 * driven by Playwright. So this is not Safari running the extension: it is
 * the Safari build's own files running in Safari's engine, with a stand-in
 * for the browser's extension host:
 *
 * - the content script and its stylesheet are added to Bandcamp pages;
 * - extension pages are served from an ordinary origin;
 * - the background script runs in a tab of its own;
 * - the few `browser.*` APIs the extension uses (sync storage, `runtime.getURL`
 *   and ports) are provided by `extensionApi` below, connected through Node.
 *
 * It finds code that WebKit runs differently. It cannot find a difference in
 * Safari's own extension APIs or permissions.
 */
const EXTENSION_ORIGIN = 'https://amp-for-bandcamp.safari-extension.test';
const BACKGROUND = '/background.html';
// The manifest's `host_permissions`.
const HOST_PERMISSIONS = /^https?:\/\/([^/]+\.)?(bcbits|bandcamp)\.com\//;
const READABLE = { 'Access-Control-Allow-Origin': '*' };

const contentTypes: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

type Changes = Record<string, { oldValue?: unknown; newValue?: unknown }>;

/** What `extensionApi` in a page tells Node. */
type Call =
  | { type: 'storage.get'; keys?: string | string[] | Record<string, unknown> }
  | { type: 'storage.set'; values: Record<string, unknown> }
  | { type: 'storage.remove'; keys: string | string[] }
  | { type: 'port.connect'; port: string; name: string }
  | { type: 'port.message'; port: string; message: unknown }
  | { type: 'port.disconnect'; port: string };

/** What Node tells `extensionApi` in a page. */
type HostEvent =
  | { type: 'storage.changed'; changes: Changes }
  | { type: 'port.connect'; port: string; name: string; url: string }
  | { type: 'port.message'; port: string; message: unknown }
  | { type: 'port.disconnect'; port: string };

type HostWindow = {
  ampExtensionHost(call: Call): Promise<unknown>;
  ampExtensionEvent?(event: HostEvent): void;
};

export async function loadInWebKit(): Promise<LoadedExtension> {
  const build = buildPath('safari');
  const read = (file: string) => readFileSync(path.join(build, file), 'utf8');
  const manifest = JSON.parse(read('manifest.json'));
  const [contentScript] = manifest.content_scripts;

  const context = await webkit.launchPersistentContext('', {});
  try {
    await context.route(`${EXTENSION_ORIGIN}/**`, (route) => {
      const { pathname } = new URL(route.request().url());
      if (pathname === BACKGROUND) {
        return route.fulfill({
          contentType: 'text/html',
          body: `<!doctype html><script src="/${manifest.background.service_worker}"></script>`,
        });
      }
      return route.fulfill({
        path: path.join(build, pathname),
        contentType: contentTypes[path.extname(pathname)],
      });
    });

    // Delivered one at a time per frame, so messages keep their order.
    const deliveries = new WeakMap<Frame, Promise<unknown>>();
    const deliver = (frame: Frame, event: HostEvent) => {
      const delivery = (deliveries.get(frame) ?? Promise.resolve()).then(
        () =>
          frame
            .evaluate(
              (hostEvent) =>
                (window as unknown as HostWindow).ampExtensionEvent?.(
                  hostEvent,
                ),
              event,
            )
            .catch(() => {}), // The frame went away.
      );
      deliveries.set(frame, delivery);
      return delivery;
    };

    const storage = new Map<string, unknown>();
    const changeStorage = async (
      keys: string[],
      next: (key: string) => { value: unknown } | undefined,
    ) => {
      const changes: Changes = {};
      for (const key of keys) {
        const oldValue = storage.get(key);
        const update = next(key);
        if (JSON.stringify(oldValue) === JSON.stringify(update?.value))
          continue;
        changes[key] = {
          ...(storage.has(key) ? { oldValue } : {}),
          ...(update ? { newValue: update.value } : {}),
        };
        if (update) storage.set(key, update.value);
        else storage.delete(key);
      }
      if (!Object.keys(changes).length) return;
      await Promise.all(
        context
          .pages()
          .flatMap((page) => page.frames())
          .map((frame) => deliver(frame, { type: 'storage.changed', changes })),
      );
    };
    const setStorage = (values: object) =>
      changeStorage(Object.keys(values), (key) => ({
        value: (values as Record<string, unknown>)[key],
      }));
    const removeStorage = (keys: string | string[]) =>
      changeStorage([keys].flat(), () => undefined);
    const getStorage = (
      keys: Extract<Call, { type: 'storage.get' }>['keys'],
    ) => {
      if (keys === undefined || keys === null)
        return Object.fromEntries(storage);
      // A string or a list names the keys; an object also gives their defaults.
      const defaults =
        typeof keys === 'object' && !Array.isArray(keys)
          ? keys
          : Object.fromEntries([keys].flat().map((key) => [key, undefined]));
      return Object.fromEntries(
        Object.entries(defaults)
          .map(([key, fallback]) => [
            key,
            storage.has(key) ? storage.get(key) : fallback,
          ])
          .filter(([, value]) => value !== undefined),
      );
    };

    const background = context.pages()[0]!;
    // The frame that opened each port; the other end is the background.
    const ports = new Map<string, Frame>();
    const otherEnd = (port: string, from: Frame) =>
      from === background.mainFrame()
        ? ports.get(port)
        : background.mainFrame();
    const disconnect = (port: string, from: Frame) => {
      const to = otherEnd(port, from);
      if (ports.delete(port) && to)
        void deliver(to, { type: 'port.disconnect', port });
    };
    context.on('page', (page) => {
      const closed = (frame: Frame) => {
        for (const [port, opener] of ports) {
          if (opener === frame) disconnect(port, frame);
        }
      };
      page.on('framedetached', closed);
      page.on('close', () => page.frames().forEach(closed));
    });

    await context.exposeBinding(
      'ampExtensionHost',
      async ({ frame }, call: Call) => {
        switch (call.type) {
          case 'storage.get':
            return getStorage(call.keys);
          case 'storage.set':
            return setStorage(call.values);
          case 'storage.remove':
            return removeStorage(call.keys);
          case 'port.connect':
            ports.set(call.port, frame);
            return deliver(background.mainFrame(), {
              ...call,
              url: frame.url(),
            });
          case 'port.message': {
            const to = otherEnd(call.port, frame);
            return to && deliver(to, call);
          }
          case 'port.disconnect':
            return disconnect(call.port, frame);
        }
      },
    );
    await context.addInitScript({
      content: `(${extensionApi})(${JSON.stringify({
        origin: EXTENSION_ORIGIN,
        id: new URL(EXTENSION_ORIGIN).hostname,
        manifest,
        css: contentScript.css.map(read).join('\n'),
      })}, function () {\n${contentScript.js.map(read).join('\n')}\n});`,
    });
    await background.goto(EXTENSION_ORIGIN + BACKGROUND);
    const fromBackground = (request: Request) => {
      try {
        return request.frame() === background.mainFrame();
      } catch {
        return false; // A new tab's first request has no frame yet.
      }
    };
    // Host permissions let the background script read these responses.
    await context.route(HOST_PERMISSIONS, async (route) => {
      if (!fromBackground(route.request())) return route.fallback();
      try {
        const response = await route.fetch();
        await route.fulfill({
          response,
          headers: { ...response.headers(), ...READABLE },
        });
      } catch {
        // The request was cancelled, or the test is over.
      }
    });

    const open = async (file: string): Promise<ExtensionPage> => {
      const page = await context.newPage();
      await page.goto(`${EXTENSION_ORIGIN}/${file}`);
      return page;
    };
    return {
      context,
      close: () => context.close(),
      extension: {
        openPopup: () => open('popup.html'),
        openAnalyzer: () => open('bpm-analyzer.html'),
        setStorage,
        removeStorage,
        async routeAudio(handler) {
          await context.route(AUDIO_URL, async (route) => {
            if (!fromBackground(route.request())) return route.abort();
            const response = await handler(route.request().url());
            await route
              .fulfill({ ...response, headers: READABLE })
              .catch(() => {});
          });
        },
      },
    };
  } catch (error) {
    await context.close();
    throw error;
  }
}

/**
 * Runs in every frame before the page's own scripts. In extension pages it
 * defines `browser` and `chrome`; in Bandcamp pages it runs the content script
 * with them, as the manifest's `content_scripts` entry would.
 */
function extensionApi(
  config: { origin: string; id: string; manifest: object; css: string },
  contentScript: () => void,
) {
  const isExtensionPage = location.origin === config.origin;
  const isBandcampPage =
    window === window.top &&
    /^https?:$/.test(location.protocol) &&
    /(^|\.)bandcamp\.com$/.test(location.hostname);
  if (!isExtensionPage && !isBandcampPage) return;

  const host = window as unknown as HostWindow;
  const call = (message: Call) => host.ampExtensionHost(message);

  function event<Listener extends (...args: never[]) => void>() {
    const listeners = new Set<Listener>();
    return {
      addListener: (listener: Listener) => void listeners.add(listener),
      removeListener: (listener: Listener) => void listeners.delete(listener),
      hasListener: (listener: Listener) => listeners.has(listener),
      fire: (...args: Parameters<Listener>) =>
        [...listeners].forEach((listener) => listener(...args)),
    };
  }

  const ports = new Map<string, ReturnType<typeof port>>();
  function port(id: string, name: string, sender?: { url: string }) {
    const self = {
      name,
      sender,
      onMessage: event<(message: unknown, from: unknown) => void>(),
      onDisconnect: event<(from: unknown) => void>(),
      postMessage(message: unknown) {
        if (!ports.has(id))
          throw new Error('Attempting to use a disconnected port object');
        void call({ type: 'port.message', port: id, message });
      },
      disconnect() {
        if (ports.delete(id)) void call({ type: 'port.disconnect', port: id });
      },
    };
    ports.set(id, self);
    return self;
  }

  const onConnect = event<(connected: ReturnType<typeof port>) => void>();
  const onChanged = event<(changes: Changes, area: string) => void>();
  host.ampExtensionEvent = (hostEvent) => {
    if (hostEvent.type === 'storage.changed') {
      return onChanged.fire(hostEvent.changes, 'sync');
    }
    if (hostEvent.type === 'port.connect') {
      return onConnect.fire(
        port(hostEvent.port, hostEvent.name, { url: hostEvent.url }),
      );
    }
    const target = ports.get(hostEvent.port);
    if (!target) return;
    if (hostEvent.type === 'port.message') {
      target.onMessage.fire(hostEvent.message, target);
    } else {
      ports.delete(hostEvent.port);
      target.onDisconnect.fire(target);
    }
  };

  const api = {
    runtime: {
      id: config.id,
      lastError: undefined,
      getManifest: () => config.manifest,
      getURL: (file: string) => config.origin + file.replace(/^\/?/, '/'),
      onConnect,
      connect({ name = '' } = {}) {
        const id = crypto.randomUUID();
        void call({ type: 'port.connect', port: id, name });
        return port(id, name);
      },
    },
    storage: {
      onChanged,
      sync: {
        get: (keys?: string | string[] | Record<string, unknown>) =>
          call({ type: 'storage.get', keys }),
        set: (values: Record<string, unknown>) =>
          call({ type: 'storage.set', values }).then(() => {}),
        remove: (keys: string | string[]) =>
          call({ type: 'storage.remove', keys }).then(() => {}),
      },
    },
  };

  const globals = window as unknown as Record<string, unknown>;
  if (isExtensionPage) {
    globals.browser = globals.chrome = api;
    return;
  }

  // `document_idle`, the manifest's `run_at`.
  const whenIdle = (run: () => void) =>
    document.readyState === 'loading'
      ? document.addEventListener('DOMContentLoaded', () => setTimeout(run), {
          once: true,
        })
      : setTimeout(run);
  whenIdle(() => {
    const style = document.createElement('style');
    style.textContent = config.css;
    document.documentElement.append(style);
    // The script picks up the API as it starts; the page never sees it.
    const names = ['browser', 'chrome'];
    const before = names.map((name) =>
      Object.getOwnPropertyDescriptor(globals, name),
    );
    globals.browser = globals.chrome = api;
    try {
      contentScript();
    } finally {
      names.forEach((name, index) => {
        if (before[index]) Object.defineProperty(globals, name, before[index]);
        else delete globals[name];
      });
    }
  });
}
