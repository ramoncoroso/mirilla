// «Investigar más»: antigüedad del dominio por RDAP, solo cuando el usuario lo pide.
// RDAP es el registro público de dominios (sucesor de WHOIS). Se pregunta directamente al registro del TLD que
// indica la lista oficial de IANA (sin intermediarios como rdap.org): ve el dominio, no la URL ni quién lo escanea.
// Los registros y IANA permiten CORS, así que no hace falta ningún permiso de acceso a webs.

import { browser } from 'wxt/browser';

const BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json';
const BOOTSTRAP_KEY = 'rdapBootstrap';
const BOOTSTRAP_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
const TIMEOUT_MS = 10_000;
/** Por debajo de esto, un dominio recién registrado es una señal muy fuerte de fraude. */
export const NEW_DOMAIN_DAYS = 30;

/** Lista de IANA: [[tlds], [urls base]] por registro. */
export interface Bootstrap {
  services: [string[], string[]][];
}

export type DomainAge =
  | { status: 'ok'; registered: string; days: number }
  /** El TLD no tiene RDAP (p. ej. .es) o el registro no da la fecha. */
  | { status: 'unavailable' }
  | { status: 'error' };

/** URL base RDAP del registro de ese dominio (por su TLD), o null si no tiene. Solo https. */
export function rdapBase(bootstrap: Bootstrap, domain: string): string | null {
  const labels = domain.toLowerCase().split('.');
  // Del sufijo más largo al más corto («co.uk» antes que «uk»), por si la lista llega a tenerlos.
  for (let i = 1; i < labels.length; i++) {
    const suffix = labels.slice(i).join('.');
    const service = bootstrap.services.find(([tlds]) => tlds.includes(suffix));
    const url = service?.[1].find((u) => u.startsWith('https://'));
    if (url) return url.endsWith('/') ? url : `${url}/`;
  }
  return null;
}

/** Fecha de registro de una respuesta RDAP (evento «registration»), o null. */
export function registrationDate(rdap: unknown): Date | null {
  const events = (rdap as { events?: { eventAction?: string; eventDate?: string }[] } | null)?.events;
  if (!Array.isArray(events)) return null;
  const event = events.find((e) => e?.eventAction === 'registration' && typeof e.eventDate === 'string');
  const date = event ? new Date(event.eventDate!) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

export function ageInDays(registered: Date, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - registered.getTime()) / 86_400_000));
}

async function fetchJson(url: string, accept = 'application/json'): Promise<unknown> {
  const res = await fetch(url, { credentials: 'omit', headers: { Accept: accept }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

/** La lista de IANA, guardada una semana (cambia poco y así no se descarga en cada consulta). */
async function bootstrap(): Promise<Bootstrap> {
  const { [BOOTSTRAP_KEY]: cached } = await browser.storage.local.get(BOOTSTRAP_KEY);
  const c = cached as { at: number; data: Bootstrap } | undefined;
  if (c && Date.now() - c.at < BOOTSTRAP_MAX_AGE_MS) return c.data;
  const data = (await fetchJson(BOOTSTRAP_URL)) as Bootstrap;
  if (!Array.isArray(data?.services)) throw new Error('bootstrap RDAP no válido');
  await browser.storage.local.set({ [BOOTSTRAP_KEY]: { at: Date.now(), data } });
  return data;
}

/** Antigüedad de un dominio registrable («ejemplo.com»). Nunca lanza. */
export async function domainAge(domain: string): Promise<DomainAge> {
  // El TLD tiene letras (o es punycode): así una IP («1.2.3.4») no llega a consultarse.
  if (!/^[a-z0-9.-]+\.(xn--[a-z0-9-]+|[a-z]{2,})$/i.test(domain)) return { status: 'unavailable' };
  try {
    const base = rdapBase(await bootstrap(), domain);
    if (!base) return { status: 'unavailable' };
    const date = registrationDate(await fetchJson(`${base}domain/${encodeURIComponent(domain)}`, 'application/rdap+json'));
    return date ? { status: 'ok', registered: date.toISOString(), days: ageInDays(date) } : { status: 'unavailable' };
  } catch {
    return { status: 'error' };
  }
}
