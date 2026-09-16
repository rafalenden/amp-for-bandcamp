import { defineConfig } from 'wxt';

const icons = Object.fromEntries(
  [32, 48, 64, 128, 256, 512, 1024].map((size) => [
    size,
    `icons/icon${size}.png`,
  ]),
);

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifestVersion: 3,
  imports: false,
  zip: {
    includeSources: [
      'src/**',
      'public/**',
      'vendor/**',
      'package.json',
      'package-lock.json',
      'tsconfig.json',
      'wxt.config.ts',
      'README.md',
      'LICENSE',
    ],
  },
  manifest: ({ browser }) => ({
    name: 'Amp for Bandcamp',
    icons,
    action: { default_icon: icons },
    permissions: ['storage'],
    host_permissions: ['*://*.bcbits.com/*', '*://*.bandcamp.com/*'],
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: { id: 'amp-for-bandcamp@enden.com' },
          },
        }
      : browser === 'safari'
        ? {
            browser_specific_settings: {
              safari: { strict_min_version: '14', strict_max_version: '*' },
            },
          }
        : {}),
  }),
});
