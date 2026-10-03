import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { defineConfig } from 'wxt';
import { locales, toMessagesJson } from './locales/messages';

const require = createRequire(import.meta.url);

export default defineConfig({
  // Firefox también en MV3 (WXT usa MV2 por defecto para Firefox).
  manifestVersion: 3,
  // La build de tests E2E va aparte: lleva <all_urls> porque Playwright no puede conceder activeTab.
  outDir: process.env.E2E ? '.output-e2e' : '.output',
  zip: {
    // El zip de fuentes (para la revisión de Firefox) no respeta .gitignore: se excluye a mano lo privado y lo generado.
    excludeSources: ['HANDOFF.md', 'test-results/**', 'playwright-report/**', '.output-e2e/**', 'store/assets/**', 'store/icons/**', 'store/galeria.html'],
  },
  // __E2E__ se sustituye al compilar: en la build normal el código de pruebas desaparece.
  vite: () => ({ define: { __E2E__: JSON.stringify(!!process.env.E2E) } }),
  hooks: {
    // El relé de órdenes de las pruebas de Firefox (entrypoints/e2e-relay.content.ts) solo va en la build E2E.
    'entrypoints:resolved': (_wxt, entrypoints) => {
      if (!process.env.E2E) entrypoints.splice(0, entrypoints.length, ...entrypoints.filter((e) => e.name !== 'e2e-relay'));
    },
    // El .wasm se copia tal cual al paquete; si se importa con ?url, Vite lo mete en base64 dentro del background.
    'build:publicAssets': (_wxt, files) => {
      files.push({ absoluteSrc: require.resolve('zxing-wasm/reader/zxing_reader.wasm'), relativeDest: 'zxing_reader.wasm' });
      files.push({ absoluteSrc: require.resolve('zxing-wasm/writer/zxing_writer.wasm'), relativeDest: 'zxing_writer.wasm' });
      // pdf.js (Apache-2.0): el worker y los decodificadores wasm de imágenes, con sus licencias. La parte principal
      // la empaqueta Vite en la página que lo usa.
      const pdfjs = path.dirname(require.resolve('pdfjs-dist/package.json'));
      files.push({ absoluteSrc: path.join(pdfjs, 'build/pdf.worker.min.mjs'), relativeDest: 'pdfjs/pdf.worker.min.mjs' });
      files.push({ absoluteSrc: path.join(pdfjs, 'LICENSE'), relativeDest: 'pdfjs/LICENSE' });
      for (const f of readdirSync(path.join(pdfjs, 'wasm'))) {
        // Sin quickjs-eval.wasm: es el motor que ejecuta el JavaScript de los PDF, y Mirilla nunca lo ejecuta.
        if ((f.endsWith('.wasm') && !f.startsWith('quickjs')) || f.startsWith('LICENSE')) files.push({ absoluteSrc: path.join(pdfjs, 'wasm', f), relativeDest: `pdfjs/wasm/${f}` });
      }
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
    // OffscreenCanvas en el service worker, Intl.DisplayNames, Array.at, ClipboardItem...: Chrome/Edge modernos.
    // 137: Ed25519 en WebCrypto (firma de la lista pública de phishing).
    minimum_chrome_version: '137',
    // alarms: descargar la lista pública cada 6 h (no muestra aviso al instalar).
    permissions: ['activeTab', 'alarms', 'contextMenus', 'scripting', 'storage'],
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
