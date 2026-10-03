import { browser, type Browser } from 'wxt/browser';
import { loadContextData, toAssessContext } from '@/lib/context';
import { decodeBlob, type Code, type Rect } from '@/lib/decode';
import { addToHistory, clearHistory, setHistoryEnabled } from '@/lib/history';
import { t } from '@/lib/i18n';
import type { FromPopup, ToBackground, ToContent } from '@/lib/messages';
import { isDangerous } from '@/lib/risk';
import { analyzeUrl } from '@/lib/url-safety';

type Tab = Browser.tabs.Tab;
type Sender = Browser.runtime.MessageSender;

/** Límites al descargar la imagen de "Leer código de esta imagen" (una página puede servir algo lento o enorme). */
const FETCH_TIMEOUT_MS = 10_000;
const FETCH_MAX_BYTES = 25 * 1024 * 1024;

export default defineBackground(() => {
  // Firefox para Android no tiene menús contextuales ni atajos: sin estas comprobaciones, el background
  // fallaría al arrancar y el popup se quedaría sin respuesta.
  const menus = browser.contextMenus as typeof browser.contextMenus | undefined;
  const commands = browser.commands as typeof browser.commands | undefined;

  browser.runtime.onInstalled.addListener(() => {
    if (!menus) return;
    menus
      .removeAll()
      .then(() => {
        menus.create({ id: 'read-image', title: t('menuReadImage'), contexts: ['image'] });
        menus.create({ id: 'select-region', title: t('menuSelectRegion'), contexts: ['all'] });
        menus.create({ id: 'scan-page', title: t('menuScanPage'), contexts: ['page'] });
      })
      .catch(console.error);
  });

  menus?.onClicked.addListener((info, tab) => {
    if (tab?.id === undefined) return;
    if (info.menuItemId === 'read-image' && info.srcUrl) void readImage(tab, info.srcUrl);
    else if (info.menuItemId === 'select-region') void startSelection(tab.id);
    else if (info.menuItemId === 'scan-page') void scanVisible(tab);
  });

  commands?.onCommand.addListener((command, tab) => {
    if (command === 'select-region' && tab?.id !== undefined) void startSelection(tab.id);
  });

  browser.runtime.onMessage.addListener((msg: ToBackground | FromPopup, sender: Sender, sendResponse: (r: unknown) => void) => {
    switch (msg.type) {
      // Desde el overlay, dentro de una pestaña: solo el marco principal (es el único donde se inyecta).
      case 'region-selected':
        if (sender.tab && sender.frameId === 0) void readRegion(sender.tab, msg.rect, msg.viewportWidth);
        break;
      case 'open-url':
        // Se vuelve a validar aquí: el mensaje viene de un script que corre dentro de la página.
        if (sender.tab && analyzeUrl(msg.url).openable) void browser.tabs.create({ url: msg.url, index: sender.tab.index + 1 });
        break;
      // Desde el popup (u otra página de la extensión), nunca desde un script en una web.
      case 'start-selection':
        if (!fromExtensionPage(sender)) return undefined;
        void startSelection(msg.tabId).then(sendResponse);
        return true;
      case 'history-add':
        if (fromExtensionPage(sender)) void addToHistory(msg.codes, msg.pageUrl).then(sendResponse, sendResponse);
        return true;
      case 'history-set-enabled':
        if (fromExtensionPage(sender)) void setHistoryEnabled(msg.enabled).then(sendResponse, sendResponse);
        return true;
      case 'history-clear':
        if (fromExtensionPage(sender)) void clearHistory().then(sendResponse, sendResponse);
        return true;
    }
    return undefined;
  });

  if (__E2E__) {
    // Solo en la build de tests: la automatización no puede pulsar menús contextuales ni atajos del navegador.
    Object.assign(globalThis, { __mirillaTest: { readImage, startSelection, scanVisible } });
    // geckodriver no puede navegar a moz-extension://: la extensión abre su propia página para las pruebas.
    if (import.meta.env.FIREFOX) {
      browser.runtime.onInstalled.addListener(() => void browser.tabs.create({ url: browser.runtime.getURL('/popup.html') }));
    }
  }
});

function fromExtensionPage(sender: Sender): boolean {
  return sender.id === browser.runtime.id && !!sender.url?.startsWith(browser.runtime.getURL('/'));
}

async function readImage(tab: Tab, srcUrl: string) {
  const tabId = tab.id!;
  if (!(await injectOverlay(tabId))) return;
  send(tabId, { type: 'show-busy' });
  try {
    let codes = await fetchAndDecode(srcUrl);
    if (codes === null || codes.length === 0) {
      // Sin CORS, SVG, demasiado grande o lento: recorta la imagen de una captura de la pestaña.
      const located = (await browser.tabs.sendMessage(tabId, { type: 'locate-image', srcUrl } satisfies ToContent)) as
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
    const res = await fetch(srcUrl, { credentials: 'omit', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const blob = await readCapped(res, FETCH_MAX_BYTES);
    return blob ? await decodeBlob(blob) : null;
  } catch {
    return null;
  }
}

/** Lee el cuerpo como Blob sin pasar de `max` bytes (un stream infinito, como un MJPEG, no agota la memoria). */
async function readCapped(res: Response, max: number): Promise<Blob | null> {
  if (Number(res.headers.get('content-length') ?? 0) > max) return null;
  if (!res.body) return res.blob();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new Blob(chunks as BlobPart[], { type: res.headers.get('content-type') ?? '' });
}

/** Devuelve si se pudo empezar (en páginas protegidas no se puede inyectar). */
async function startSelection(tabId: number): Promise<boolean> {
  if (!(await injectOverlay(tabId))) return false;
  send(tabId, { type: 'start-selection' });
  return true;
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
  const tabId = tab.id!;
  await browser.tabs.sendMessage(tabId, { type: 'prepare-capture' } satisfies ToContent).catch(() => {});
  // captureVisibleTab captura la pestaña activa de la ventana: si el usuario ha cambiado de pestaña
  // mientras tanto (p. ej. durante una descarga lenta), se capturaría otra página.
  const [active] = await browser.tabs.query({ active: true, windowId: tab.windowId });
  if (active?.id !== tabId) throw new Error('La pestaña ya no está activa');
  const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId!, { format: 'png' });
  send(tabId, { type: 'show-busy' });
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
  const tabId = tab.id!;
  // El contexto se carga antes de guardar la lectura: si no, todo enlace sería «ya visto».
  const ctx = await loadContextData().catch(() => undefined);
  send(tabId, { type: 'show-results', codes, ctx });
  const assessCtx = ctx && toAssessContext(ctx);
  void markTab(tabId, codes.some((c) => isDangerous(c, assessCtx)));
  // Nada de ventanas privadas en el historial. Un fallo al guardarlo no debe tapar los resultados ya mostrados.
  if (!tab.incognito) await addToHistory(codes, tab.url ?? '').catch(console.error);
}

/** "!" rojo en el icono de la extensión para esa pestaña: la página puede tapar su panel, pero no esto. */
async function markTab(tabId: number, danger: boolean) {
  try {
    await browser.action.setBadgeText({ tabId, text: danger ? '!' : '' });
    if (danger) await browser.action.setBadgeBackgroundColor({ tabId, color: '#d93025' });
  } catch {
    /* la pestaña se ha cerrado */
  }
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
