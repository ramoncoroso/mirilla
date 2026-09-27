import { createRequire } from 'node:module';
import { defineConfig } from 'wxt';
import { locales, toMessagesJson } from './locales/messages';

const require = createRequire(import.meta.url);

export default defineConfig({
  // Firefox también en MV3 (WXT usa MV2 por defecto para Firefox).
  manifestVersion: 3,
  // La build de tests E2E va aparte: lleva <all_urls> porque Playwright no puede conceder activeTab.
  outDir: process.env.E2E ? '.output-e2e' : '.output',
  hooks: {
    // El .wasm se copia tal cual al paquete; si se importa con ?url, Vite lo mete en base64 dentro del background.
    'build:publicAssets': (_wxt, files) => {
      files.push({ absoluteSrc: require.resolve('zxing-wasm/reader/zxing_reader.wasm'), relativeDest: 'zxing_reader.wasm' });
      // Traducciones: se generan desde locales/messages.ts.
      for (const [lang, messages] of Object.entries(locales)) {
        files.push({ contents: toMessagesJson(messages), relativeDest: `_locales/${lang}/messages.json` });
      }
    },
  },
  manifest: ({ browser }) => ({
    name: '__MSG_extName__',
    short_name: 'Mirilla',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    permissions: ['activeTab', 'contextMenus', 'scripting', 'storage'],
    ...(process.env.E2E && { host_permissions: ['<all_urls>'] }),
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
    commands: {
      'select-region': {
        suggested_key: { default: 'Alt+Shift+Q' },
        description: '__MSG_cmdSelectRegion__',
      },
    },
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'mirilla@ramoncoroso.github.io',
          strict_min_version: '140.0',
          data_collection_permissions: { required: ['none'] },
        },
        gecko_android: { strict_min_version: '142.0' },
      },
    }),
  }),
});
