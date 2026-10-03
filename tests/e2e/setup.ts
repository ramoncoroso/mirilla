import { test as base, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Estos callbacks se ejecutan dentro de la extensión, donde existe la API chrome.*.
declare const chrome: any;

export { expect } from '@playwright/test';

const extPath = path.resolve('.output-e2e/chrome-mv3');
export const fixture = (name: string) => path.resolve('tests/e2e/fixtures', name);

export const ORIGIN = 'http://pruebas.test';
const MIME: Record<string, string> = { '.png': 'image/png', '.svg': 'image/svg+xml' };

interface Options {
  /** Idioma de la interfaz del navegador. En Linux, Chromium lo toma de LANGUAGE. */
  lang: string;
  /** devicePixelRatio de la pantalla simulada. */
  dpr: number;
  /** Argumentos extra de Chromium (cámara falsa, captura de pantalla automática...). */
  launchArgs: string[];
}

export const test = base.extend<Options & { context: BrowserContext; sw: Worker; extId: string; pages: Map<string, string> }>({
  lang: ['en', { option: true }],
  dpr: [1, { option: true }],
  launchArgs: [[], { option: true }],
  pages: async ({}, use) => use(new Map()),
  context: async ({ lang, dpr, launchArgs, pages }, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      env: { ...process.env, LANGUAGE: lang },
      deviceScaleFactor: dpr,
      args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`, ...launchArgs],
    });
    // Web de pruebas en un origen http normal: /fixtures/* sirve las imágenes; el resto, las páginas registradas.
    await context.route(`${ORIGIN}/**`, (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/fixtures/')) {
        const file = path.basename(url.pathname);
        return route.fulfill({ contentType: MIME[path.extname(file)], body: readFileSync(fixture(file)) });
      }
      const html = pages.get(url.pathname);
      if (html === undefined) return route.fulfill({ status: 404 });
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
    });
    await use(context);
    await context.close();
  },
  sw: async ({ context }, use) => {
    await use(context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker')));
  },
  extId: async ({ sw }, use) => {
    await use(new URL(sw.url()).host);
  },
});

/** Abre una página de pruebas con el HTML dado y espera a que carguen sus imágenes. */
export async function openPage(context: BrowserContext, pages: Map<string, string>, pathname: string, body: string) {
  // Se registra por ruta (sin query), que es como la busca el servidor de pruebas.
  pages.set(new URL(pathname, ORIGIN).pathname, `<!doctype html><html><body style="margin:0;background:#fff">${body}</body></html>`);
  const page = await context.newPage();
  await page.goto(ORIGIN + pathname);
  await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete));
  return page;
}

export async function tabIdOf(sw: Worker, page: Page): Promise<number> {
  const url = page.url();
  return sw.evaluate(async (url) => (await chrome.tabs.query({})).find((t: { url: string }) => t.url === url).id, url);
}

/** Textos leídos, del más reciente al más antiguo (el historial es el único estado observable del panel, que va en shadow DOM cerrado). */
export async function history(sw: Worker): Promise<string[]> {
  return sw.evaluate(async () => ((await chrome.storage.local.get('history')).history ?? []).map((h: { text: string }) => h.text));
}

/** Llama a las funciones que ejecutan los menús contextuales (expuestas solo en la build E2E). */
export async function callMenu(sw: Worker, fn: 'readImage' | 'startSelection' | 'scanVisible', tabId: number, arg?: string) {
  await sw.evaluate(
    async ({ fn, tabId, arg }) => {
      const api = (globalThis as any).__mirillaTest;
      const tab = await chrome.tabs.get(tabId);
      if (fn === 'readImage') await api.readImage(tab, arg);
      else if (fn === 'startSelection') await api.startSelection(tabId);
      else await api.scanVisible(tab);
    },
    { fn, tabId, arg },
  );
}

/** Arrastra un rectángulo con el ratón, con margen alrededor de la caja dada. */
export async function dragAround(page: Page, box: { x: number; y: number; width: number; height: number }, margin = 20) {
  await page.mouse.move(box.x - margin, box.y - margin);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
  await page.mouse.move(box.x + box.width + margin, box.y + box.height + margin, { steps: 5 });
  await page.mouse.up();
}
