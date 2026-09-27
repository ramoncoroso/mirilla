import { browser } from 'wxt/browser';
import type { Code } from './decode';

export interface HistoryEntry extends Code {
  at: number;
  /** Origen de la página donde se leyó (https://ejemplo.com), vacío si vino de un fichero o del portapapeles. */
  source: string;
}

const KEY = 'history';
const ENABLED_KEY = 'historyEnabled';
const MAX = 50;

// ---- Lectura (cualquier contexto) ----

export async function isHistoryEnabled(): Promise<boolean> {
  const { [ENABLED_KEY]: enabled } = await browser.storage.local.get(ENABLED_KEY);
  return enabled !== false;
}

export async function getHistory(): Promise<HistoryEntry[]> {
  const { [KEY]: entries } = await browser.storage.local.get(KEY);
  return (entries as HistoryEntry[] | undefined) ?? [];
}

// ---- Escritura: solo desde el background, en una cola ----
// Las lecturas pueden terminar a la vez (popup y menú contextual): sin cola, dos "leer-modificar-guardar"
// se pisarían. Y comprobando `enabled` dentro de cada paso, una lectura que termina justo después de
// desactivar el historial no lo vuelve a escribir.

let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(step: () => Promise<T>): Promise<T> {
  const next = queue.then(step, step);
  queue = next.catch(() => {});
  return next;
}

export function addToHistory(codes: Code[], pageUrl: string): Promise<void> {
  return enqueue(async () => {
    if (codes.length === 0 || !(await isHistoryEnabled())) return;
    const now = Date.now();
    const source = originOf(pageUrl);
    const fresh = codes.map((c) => ({ ...c, at: now, source }));
    const old = (await getHistory()).filter((h) => !codes.some((c) => c.text === h.text && c.format === h.format));
    await browser.storage.local.set({ [KEY]: [...fresh, ...old].slice(0, MAX) });
  });
}

export function setHistoryEnabled(enabled: boolean): Promise<void> {
  return enqueue(async () => {
    await browser.storage.local.set({ [ENABLED_KEY]: enabled });
    if (!enabled) await browser.storage.local.remove(KEY);
  });
}

export function clearHistory(): Promise<void> {
  return enqueue(() => browser.storage.local.remove(KEY));
}

/** Solo el origen: la URL completa puede llevar tokens o datos personales en la ruta o la query. */
export function originOf(pageUrl: string): string {
  try {
    const { protocol, origin } = new URL(pageUrl);
    return protocol === 'http:' || protocol === 'https:' ? origin : '';
  } catch {
    return '';
  }
}
