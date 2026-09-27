import { browser } from 'wxt/browser';
import type { Code } from './decode';

export interface HistoryEntry extends Code {
  at: number;
  /** Página donde se leyó (vacío si vino de un fichero o del portapapeles). */
  source: string;
}

const KEY = 'history';
const ENABLED_KEY = 'historyEnabled';
const MAX = 50;

export async function isHistoryEnabled(): Promise<boolean> {
  const { [ENABLED_KEY]: enabled } = await browser.storage.local.get(ENABLED_KEY);
  return enabled !== false;
}

export async function setHistoryEnabled(enabled: boolean) {
  await browser.storage.local.set({ [ENABLED_KEY]: enabled });
  if (!enabled) await clearHistory();
}

export async function getHistory(): Promise<HistoryEntry[]> {
  const { [KEY]: entries } = await browser.storage.local.get(KEY);
  return (entries as HistoryEntry[] | undefined) ?? [];
}

export async function addToHistory(codes: Code[], source: string) {
  if (codes.length === 0 || !(await isHistoryEnabled())) return;
  const now = Date.now();
  const fresh = codes.map((c) => ({ ...c, at: now, source }));
  const old = (await getHistory()).filter((h) => !codes.some((c) => c.text === h.text && c.format === h.format));
  await browser.storage.local.set({ [KEY]: [...fresh, ...old].slice(0, MAX) });
}

export async function clearHistory() {
  await browser.storage.local.remove(KEY);
}
