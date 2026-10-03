// Descarga, comprobación y búsqueda de la lista pública de phishing (ver lib/blocklist.ts).
// Se descarga entera cada 6 h (chrome.alarms) desde GitHub Pages y se compara en el equipo: la descarga no revela
// nada de lo que se escanea. Si la firma no cuadra, se descarta y se sigue con la última buena (con su fecha).
// Se guarda en IndexedDB (unos MB: storage.local tiene límite), compartida por el background y el popup.

import { browser } from 'wxt/browser';
import { Blocklist, verifyBlocklist, type BlocklistMeta } from './blocklist';

export const BLOCKLIST_BASE = 'https://ramoncoroso.github.io/mirilla/blocklist/';
/** Clave pública Ed25519 (en bruto, base64). La build E2E usa la de pruebas (tests/e2e/blocklist-key.json). */
const PUBLIC_KEY = __E2E__ ? 'qGf+29vzAY5qYIMgx3YLB7NUKkslG8C0D2QDtWJT6JY=' : 'p2m3vSZX7uhqtgmdkXDykqRhcqPv/c6E0V1tC/2TQ6w=';
export const UPDATE_ALARM = 'blocklist-update';
export const UPDATE_MINUTES = 6 * 60;
const ENABLED_KEY = 'blocklistEnabled';
const NOTICE_KEY = 'blocklistNoticeSeen';
const TIMEOUT_MS = 60_000;

const DB = 'mirilla';
const STORE = 'blocklist';
const RECORD = 'current';

interface Stored {
  meta: Uint8Array;
  sig: string;
  bin: Uint8Array;
  /** Última vez que se comprobó que era la más reciente. */
  checkedAt: number;
}

// ---- Ajuste ----

export async function isBlocklistEnabled(): Promise<boolean> {
  const { [ENABLED_KEY]: enabled } = await browser.storage.local.get(ENABLED_KEY);
  return enabled !== false;
}

export async function setBlocklistEnabled(enabled: boolean): Promise<void> {
  await browser.storage.local.set({ [ENABLED_KEY]: enabled });
  if (!enabled) {
    memory = null;
    await idb('readwrite', (s) => s.delete(RECORD));
  }
}

/** El aviso de la primera ejecución («Mirilla descarga una lista pública…») ya se ha visto. */
export async function blocklistNoticeSeen(): Promise<boolean> {
  const { [NOTICE_KEY]: seen } = await browser.storage.local.get(NOTICE_KEY);
  return seen === true;
}

export async function markBlocklistNoticeSeen(): Promise<void> {
  await browser.storage.local.set({ [NOTICE_KEY]: true });
}

// ---- IndexedDB ----

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = op(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

// ---- Descarga ----

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { credentials: 'omit', cache: 'no-cache', signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

let memory: Blocklist | null = null;
let updating: Promise<void> | null = null;

/** Descarga la lista si hay una nueva. Nunca lanza: si algo falla, se queda la última buena. */
export function updateBlocklist(): Promise<void> {
  updating ??= (async () => {
    try {
      if (!(await isBlocklistEnabled())) return;
      const [meta, sigBytes] = await Promise.all([fetchBytes(`${BLOCKLIST_BASE}meta.json`), fetchBytes(`${BLOCKLIST_BASE}meta.sig`)]);
      const sig = new TextDecoder().decode(sigBytes);
      const stored = await idb<Stored | undefined>('readonly', (s) => s.get(RECORD));
      const fresh = JSON.parse(new TextDecoder().decode(meta)) as BlocklistMeta;
      const same = stored && (JSON.parse(new TextDecoder().decode(stored.meta)) as BlocklistMeta).sha256 === fresh.sha256;
      const bin = same ? stored.bin : await fetchBytes(`${BLOCKLIST_BASE}blocklist.bin`);
      const list = await verifyBlocklist(meta, sig, bin, PUBLIC_KEY);
      // Se desactivó mientras se descargaba: no se guarda.
      if (!(await isBlocklistEnabled())) return;
      await idb('readwrite', (s) => s.put({ meta, sig, bin, checkedAt: Date.now() } satisfies Stored, RECORD));
      memory = list;
    } catch (e) {
      console.warn('Mirilla: no se ha podido actualizar la lista pública', e);
    } finally {
      updating = null;
    }
  })();
  return updating;
}

/** La lista guardada (verificada de nuevo al cargarla), o null si no hay o está desactivada. */
export async function loadBlocklist(): Promise<Blocklist | null> {
  if (!(await isBlocklistEnabled())) return null;
  if (memory) return memory;
  try {
    const stored = await idb<Stored | undefined>('readonly', (s) => s.get(RECORD));
    if (!stored) return null;
    memory = await verifyBlocklist(stored.meta, stored.sig, stored.bin, PUBLIC_KEY);
    return memory;
  } catch {
    return null;
  }
}

/** Para los ajustes: fecha de la lista guardada y cuántas entradas tiene. */
export async function blocklistInfo(): Promise<{ generated: string; entries: number } | null> {
  const list = await loadBlocklist();
  return list ? { generated: list.meta.generated, entries: list.meta.domains + list.meta.urls } : null;
}

/** De estos enlaces, los que están en la lista. */
export async function listedLinks(hrefs: readonly string[]): Promise<{ listed: string[]; generated: string } | null> {
  const list = await loadBlocklist();
  if (!list) return null;
  const listed: string[] = [];
  for (const href of new Set(hrefs)) if (await list.has(href)) listed.push(href);
  return { listed, generated: list.meta.generated };
}
