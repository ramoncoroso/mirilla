// Contexto del usuario para el veredicto: sus sitios de confianza y los dominios que ya ha leído con Mirilla.
// Se guarda en storage.local y se carga al mostrar resultados, siempre antes de añadir la lectura actual al
// historial (si no, todo enlace sería «ya visto»). Entre background y página viaja como ContextData (serializable).

import { browser } from 'wxt/browser';
import { getHistory, isHistoryEnabled } from './history';
import { extractLinks } from './links';
import { references } from './lookalike';
import { analyzeUrl } from './url-safety';
import type { AssessContext } from './verdict';

const TRUSTED_KEY = 'trustedSites';
const MAX_TRUSTED = 100;

/** Contexto serializable: el que se manda a la página en `show-results`. */
export interface ContextData {
  trusted: string[];
  /** Dominios registrables ya leídos, o null si el historial está desactivado. */
  known: string[] | null;
}

export async function getTrustedSites(): Promise<string[]> {
  const { [TRUSTED_KEY]: sites } = await browser.storage.local.get(TRUSTED_KEY);
  return Array.isArray(sites) ? sites.filter((s): s is string => typeof s === 'string') : [];
}

/**
 * Dominio registrable de lo que escribe el usuario («https://www.mibanco.es/login», «mibanco.es», «WWW.MIBANCO.ES»),
 * o null si no es un dominio web (una IP, «localhost», texto sin punto...).
 */
export function normalizeSite(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const report = analyzeUrl(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
  const domain = report.openable ? report.domain : '';
  return /^[^.]+\..*[a-z]/i.test(domain) && !/^[\d.]+$/.test(domain) && !domain.includes(':') ? domain : null;
}

/** Añade un sitio de confianza. Devuelve el dominio guardado, o null si no es válido. */
export async function addTrustedSite(input: string): Promise<string | null> {
  const domain = normalizeSite(input);
  if (!domain) return null;
  const sites = await getTrustedSites();
  if (!sites.includes(domain)) await browser.storage.local.set({ [TRUSTED_KEY]: [...sites, domain].slice(-MAX_TRUSTED) });
  return domain;
}

export async function removeTrustedSite(domain: string): Promise<void> {
  const sites = await getTrustedSites();
  await browser.storage.local.set({ [TRUSTED_KEY]: sites.filter((s) => s !== domain) });
}

/** Dominios de los enlaces que hay en lo leído (el código entero o los enlaces que lleva dentro). */
export function linkDomains(texts: readonly string[]): string[] {
  const domains = new Set<string>();
  for (const text of texts) {
    const links = /^https?:\/\//i.test(text.trim()) ? [text.trim()] : extractLinks(text);
    for (const link of links) {
      const { domain, openable } = analyzeUrl(link);
      if (openable && domain) domains.add(domain);
    }
  }
  return [...domains];
}

export async function loadContextData(): Promise<ContextData> {
  const [trusted, enabled, history] = await Promise.all([getTrustedSites(), isHistoryEnabled(), getHistory()]);
  return { trusted, known: enabled ? linkDomains(history.map((h) => h.text)) : null };
}

export function toAssessContext(data: ContextData): AssessContext {
  return {
    refs: references(data.trusted),
    trusted: data.trusted,
    known: data.known ? new Set(data.known) : null,
    historyOff: data.known === null,
  };
}

export async function loadContext(): Promise<AssessContext> {
  return toAssessContext(await loadContextData());
}
