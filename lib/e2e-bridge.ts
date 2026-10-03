// Solo en la build E2E (el background lo importa tras `if (__E2E__)`, así que no llega a la build publicada).
// Firefox 157+ no deja que geckodriver toque las pestañas moz-extension://, así que el test manda órdenes desde una
// página http normal: el script de contenido e2e-relay las pasa al background, que las ejecuta aquí.
// Solo hay órdenes predefinidas (la CSP de la extensión prohíbe eval).

import { browser, type Browser } from 'wxt/browser';

export type Command =
  | { op: 'clear' }
  | { op: 'history' }
  | { op: 'setStorage'; items: Record<string, unknown> }
  | { op: 'getStorage'; key: string }
  | { op: 'openScan'; mode: string }
  | { op: 'closeTab'; tabId: number }
  | { op: 'tabIdByUrl'; url: string }
  | { op: 'activate'; tabId: number }
  | { op: 'setZoom'; tabId: number; zoom: number }
  | { op: 'roundTrip'; text: string }
  | { op: 'badge'; tabId: number }
  | { op: 'menu'; fn: 'readImage' | 'startSelection' | 'scanVisible'; tabId: number; arg?: string };

export interface TestApi {
  readImage(tab: Browser.tabs.Tab, srcUrl: string): Promise<void>;
  startSelection(tabId: number): Promise<boolean>;
  scanVisible(tab: Browser.tabs.Tab): Promise<void>;
}

export async function run(cmd: Command, api: TestApi): Promise<unknown> {
  switch (cmd.op) {
    case 'clear':
      return browser.storage.local.clear();
    case 'history': {
      const { history } = await browser.storage.local.get('history');
      return ((history as { text: string }[] | undefined) ?? []).map((h) => h.text);
    }
    case 'setStorage':
      return browser.storage.local.set(cmd.items);
    case 'getStorage':
      return (await browser.storage.local.get(cmd.key))[cmd.key] ?? null;
    case 'closeTab':
      return browser.tabs.remove(cmd.tabId);
    case 'openScan':
      return (await browser.tabs.create({ url: browser.runtime.getURL(`/scan.html?mode=${cmd.mode}`) })).id;
    case 'tabIdByUrl':
      // Los patrones de tabs.query no admiten puertos: se compara la URL exacta.
      return (await browser.tabs.query({})).find((t) => t.url === cmd.url)?.id;
    case 'activate':
      return void (await browser.tabs.update(cmd.tabId, { active: true }));
    case 'setZoom':
      return browser.tabs.setZoom(cmd.tabId, cmd.zoom);
    case 'roundTrip': {
      // Genera un QR con el codificador y lo vuelve a leer con el lector (los dos WASM, con la CSP real).
      const { generateQr } = await import('./generate');
      const { decodeBlob } = await import('./decode');
      return (await decodeBlob(await generateQr(cmd.text))).map((c) => c.text);
    }
    case 'badge':
      return browser.action.getBadgeText({ tabId: cmd.tabId });
    case 'menu': {
      const tab = await browser.tabs.get(cmd.tabId);
      if (cmd.fn === 'readImage') await api.readImage(tab, cmd.arg ?? '');
      else if (cmd.fn === 'startSelection') await api.startSelection(cmd.tabId);
      else await api.scanVisible(tab);
      return null;
    }
  }
}
