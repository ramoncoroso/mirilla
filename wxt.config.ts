import { createRequire } from 'node:module';
import { defineConfig } from 'wxt';

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
    },
  },
  manifest: ({ browser }) => ({
    name: 'Mirilla — Lector QR y códigos de barras',
    short_name: 'Mirilla',
    description:
      'Mira adónde lleva un código antes de abrirlo. Lee QR y códigos de barras de cualquier web, en local: sin servidores ni rastreo.',
    permissions: ['activeTab', 'contextMenus', 'scripting', 'storage'],
    ...(process.env.E2E && { host_permissions: ['<all_urls>'] }),
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
    commands: {
      'select-region': {
        suggested_key: { default: 'Alt+Shift+Q' },
        description: 'Seleccionar un área de la página para leer',
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
