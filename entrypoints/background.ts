import { browser, type Browser } from 'wxt/browser';
import { decodeBlob, type Code, type Rect } from '@/lib/decode';
import { addToHistory } from '@/lib/history';
import { t } from '@/lib/i18n';
import type { FromPopup, ToBackground, ToContent } from '@/lib/messages';
import { analyzeUrl } from '@/lib/url-safety';

type Tab = Browser.tabs.Tab;

declare const __E2E__: boolean;

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.removeAll().then(() => {
      browser.contextMenus.create({ id: 'read-image', title: t('menuReadImage'), contexts: ['image'] });
      browser.contextMenus.create({ id: 'select-region', title: t('menuSelectRegion'), contexts: ['all'] });
      browser.contextMenus.create({ id: 'scan-page', title: t('menuScanPage'), contexts: ['page'] });
    });
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (!tab?.id) return;
    if (info.menuItemId === 'read-image' && info.srcUrl) void readImage(tab, info.srcUrl);
    else if (info.menuItemId === 'select-region') void startSelection(tab.id);
    else if (info.menuItemId === 'scan-page') void scanVisible(tab);
  });

  if (__E2E__) {
    // Solo en la build de tests: la automatización no puede pulsar menús contextuales ni atajos del navegador.
    Object.assign(globalThis, { __mirillaTest: { readImage, startSelection, scanVisible } });
    // geckodriver no puede navegar a moz-extension://: la extensión abre su propia página para las pruebas.
    if (import.meta.env.FIREFOX) {
      browser.runtime.onInstalled.addListener(() => void browser.tabs.create({ url: browser.runtime.getURL('/popup.html') }));
    }
  }

  browser.commands.onCommand.addListener((command, tab) => {
    if (command === 'select-region' && tab?.id) void startSelection(tab.id);
  });

  browser.runtime.onMessage.addListener((msg: ToBackground | FromPopup, sender) => {
    switch (msg.type) {
      case 'region-selected':
        if (sender.tab) void readRegion(sender.tab, msg.rect, msg.viewportWidth);
        break;
      case 'open-url':
        // Se vuelve a validar aquí: el mensaje viene de un script que corre dentro de la página.
        if (analyzeUrl(msg.url).openable) void browser.tabs.create({ url: msg.url, index: sender.tab ? sender.tab.index + 1 : undefined });
        break;
      case 'start-selection':
        void startSelection(msg.tabId);
        break;
    }
    return undefined;
  });
});

async function readImage(tab: Tab, srcUrl: string) {
  if (!(await injectOverlay(tab.id!))) return;
  send(tab.id!, { type: 'show-busy' });
  try {
    let codes = await fetchAndDecode(srcUrl);
    if (codes === null || codes.length === 0) {
      // Sin CORS, SVG u otro formato raro: recorta la imagen de una captura de la pestaña.
      const located = (await browser.tabs.sendMessage(tab.id!, { type: 'locate-image', srcUrl } satisfies ToContent)) as
        | { rect: Rect; viewportWidth: number }
        | null;
      if (located) codes = await captureAndDecode(tab, located.rect, located.viewportWidth);
    }
    await finish(tab, codes ?? []);
  } catch (e) {
    finishWithError(tab, e);
  }
}

async function fetchAndDecode(srcUrl: string): Promise<Code[] | null> {
  try {
    const res = await fetch(srcUrl, { credentials: 'omit' });
    if (!res.ok) return null;
    return await decodeBlob(await res.blob());
  } catch {
    return null;
  }
}

async function startSelection(tabId: number) {
  if (await injectOverlay(tabId)) send(tabId, { type: 'start-selection' });
}

async function readRegion(tab: Tab, rect: Rect, viewportWidth: number) {
  try {
    await finish(tab, await captureAndDecode(tab, rect, viewportWidth));
  } catch (e) {
    finishWithError(tab, e);
  }
}

async function scanVisible(tab: Tab) {
  if (!(await injectOverlay(tab.id!))) return;
  try {
    await finish(tab, await captureAndDecode(tab));
  } catch (e) {
    finishWithError(tab, e);
  }
}

/**
 * Captura lo visible de la pestaña y decodifica, opcionalmente solo un rectángulo (en px CSS del viewport).
 * El panel de Mirilla se oculta antes de capturar y el "Leyendo…" se muestra después:
 * si no, el propio panel tapa los códigos de la esquina superior derecha.
 */
async function captureAndDecode(tab: Tab, rect?: Rect, viewportWidth?: number): Promise<Code[]> {
  await browser.tabs.sendMessage(tab.id!, { type: 'prepare-capture' } satisfies ToContent).catch(() => {});
  const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  send(tab.id!, { type: 'show-busy' });
  const blob = await (await fetch(dataUrl)).blob();
  if (!rect || !viewportWidth) return decodeBlob(blob);

  // La captura va en píxeles físicos (devicePixelRatio × zoom); se escala con el ancho real.
  const full = await createImageBitmap(blob);
  const scale = full.width / viewportWidth;
  const bounds = { w: full.width, h: full.height };
  full.close();
  const x = clamp(rect.x * scale, 0, bounds.w);
  const y = clamp(rect.y * scale, 0, bounds.h);
  const crop = {
    x,
    y,
    width: clamp(rect.width * scale, 1, bounds.w - x),
    height: clamp(rect.height * scale, 1, bounds.h - y),
  };
  return decodeBlob(blob, crop);
}

async function finish(tab: Tab, codes: Code[]) {
  send(tab.id!, { type: 'show-results', codes });
  await addToHistory(codes, tab.url ?? '');
}

function finishWithError(tab: Tab, e: unknown) {
  console.error(e);
  send(tab.id!, { type: 'show-results', codes: [], error: t('readError') });
}

/**
 * Inyecta el script de la interfaz en la pestaña (activeTab lo permite tras un gesto del usuario).
 * Falla en páginas protegidas (chrome://, tiendas de extensiones, visor PDF...).
 */
async function injectOverlay(tabId: number): Promise<boolean> {
  try {
    await browser.scripting.executeScript({ target: { tabId }, files: ['/overlay.js'] });
    return true;
  } catch (e) {
    console.warn('No se puede inyectar en esta pestaña', e);
    return false;
  }
}

function send(tabId: number, msg: ToContent) {
  browser.tabs.sendMessage(tabId, msg).catch(() => {});
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
