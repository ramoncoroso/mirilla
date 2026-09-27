// Análisis local de una URL leída de un código, pensado contra el "quishing".
// No consulta ningún servicio: solo heurísticas sobre la propia URL y la Public Suffix List (tldts, incluida en el paquete).
// Devuelve claves de mensaje (la traducción la hace la interfaz) para poder testearlo sin navegador.

import { parse as parseDomain } from 'tldts';
import type { MessageKey } from '@/locales/messages';

export type Level = 'danger' | 'warn' | 'info';
export interface Finding {
  level: Level;
  message: MessageKey;
  /** Sustituciones $1, $2... del mensaje. */
  args?: string[];
}
export interface UrlReport {
  /** Se puede ofrecer un botón "Abrir". */
  openable: boolean;
  /** Host tal como lo verá el navegador (minúsculas, punycode, sin punto final). */
  host: string;
  /** La URL que abriría el navegador (normalizada); es la que se muestra. */
  href: string;
  findings: Finding[];
}

const SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'cutt.ly', 'rebrand.ly',
  'shorturl.at', 'tiny.cc', 'rb.gy', 'bl.ink', 'lnkd.in', 's.id', 'v.gd', 'qrco.de', 'qr.link',
  'qrs.ly', 'scan.page', 'l.ead.me', 'short.io', 'shorturl.asia', 'y2u.be', 'urlz.fr', 'surl.li',
]);

const DANGEROUS_SCHEMES = new Set(['javascript:', 'data:', 'vbscript:', 'file:', 'blob:', 'filesystem:']);

const PHISHING_WORDS = /(^|[.-])(login|signin|verify|secure|account|update|banking)([.-]|$)/;

export function analyzeUrl(raw: string): UrlReport {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { openable: false, host: '', href: raw, findings: [{ level: 'danger', message: 'urlInvalid' }] };
  }

  const findings: Finding[] = [];
  const scheme = url.protocol.toLowerCase();

  if (DANGEROUS_SCHEMES.has(scheme)) {
    return { openable: false, host: '', href: url.href, findings: [{ level: 'danger', message: 'urlDangerousScheme', args: [scheme] }] };
  }
  if (scheme !== 'http:' && scheme !== 'https:') {
    return { openable: false, host: url.host, href: url.href, findings: [{ level: 'warn', message: 'urlNonWebScheme', args: [scheme] }] };
  }

  // "bit.ly." es el mismo host que "bit.ly": el punto final no debe esquivar ninguna comprobación.
  const host = url.hostname.toLowerCase().replace(/\.$/, '');

  if (url.username || url.password) {
    findings.push({ level: 'danger', message: 'urlUserinfo', args: [decodeSafe(url.username), host] });
  }
  if (host.split('.').some((label) => label.startsWith('xn--'))) {
    findings.push({ level: 'danger', message: 'urlPunycode' });
  }
  if (isIpAddress(host)) {
    findings.push({ level: 'warn', message: 'urlIp' });
  }
  if (scheme === 'http:') {
    findings.push({ level: 'warn', message: 'urlHttp' });
  }
  const redirect = redirectTarget(url, host);
  if (redirect) {
    findings.push({ level: 'warn', message: 'urlRedirect', args: redirect });
  }
  if (SHORTENERS.has(host.replace(/^www\./, ''))) {
    findings.push({ level: 'info', message: 'urlShortener' });
  }
  const suffix = sharedHostingSuffix(host);
  if (suffix) {
    findings.push({ level: 'info', message: 'urlSharedHosting', args: [suffix] });
  }
  if (url.port && url.port !== '80' && url.port !== '443') {
    findings.push({ level: 'info', message: 'urlPort', args: [url.port] });
  }
  if (host.split('.').length > 5) {
    findings.push({ level: 'warn', message: 'urlSubdomains' });
  }
  if (PHISHING_WORDS.test(host)) {
    // Sola es una pista débil (login.microsoftonline.com es legítimo); junto a otras señales, un aviso.
    findings.push({ level: findings.length > 0 ? 'warn' : 'info', message: 'urlPhishingWords' });
  }

  return { openable: true, host, href: url.href, findings };
}

function isIpAddress(host: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[');
}

/** Parámetro de la query que lleva otra URL con otro host (redirector abierto), como [nombre, host de destino]. */
function redirectTarget(url: URL, host: string): [string, string] | null {
  for (const [name, value] of url.searchParams) {
    const v = value.trim();
    if (!/^(https?:)?\/\//i.test(v)) continue;
    try {
      const target = new URL(v.startsWith('//') ? `https:${v}` : v);
      const targetHost = target.hostname.toLowerCase().replace(/\.$/, '');
      if (targetHost && mainDomain(targetHost) !== mainDomain(host)) return [name, targetHost];
    } catch {
      /* no es una URL */
    }
  }
  return null;
}

/** Sufijo de una plataforma donde cualquiera crea subdominios (github.io, pages.dev...), según la PSL privada. */
function sharedHostingSuffix(host: string): string | null {
  if (isIpAddress(host)) return null;
  const info = parseDomain(host, { allowPrivateDomains: true });
  return info.isPrivate && info.publicSuffix ? info.publicSuffix : null;
}

/**
 * Dominio registrable según la Public Suffix List, incluidas las plataformas compartidas:
 * en "paypal.github.io" es "paypal.github.io" (el sitio de quien lo publicó), no "github.io".
 */
export function mainDomain(host: string): string {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (isIpAddress(h)) return h;
  return parseDomain(h, { allowPrivateDomains: true }).domain ?? h;
}

/**
 * Posición del dominio principal dentro de una URL normalizada (href), para resaltarlo.
 * Se busca al final del host (dentro de la autoridad), así que nunca se resalta un "paypal.com"
 * que esté en el usuario o en la ruta; y solo si empieza en un límite de etiqueta (tras "//", "@" o ".").
 */
export function highlightRange(href: string, host: string): [number, number] | null {
  const main = host ? mainDomain(host) : '';
  if (!main) return null;
  const start = href.indexOf('//');
  if (start < 0) return null;
  const from = start + 2;
  const rest = href.slice(from);
  const cut = rest.search(/[/?#]/);
  const authority = rest.slice(0, cut < 0 ? rest.length : cut).toLowerCase();
  const hostEnd = authority.replace(/:\d+$/, '').replace(/\.$/, '').length;
  const idx = hostEnd - main.length;
  if (idx < 0 || authority.slice(idx, hostEnd) !== main) return null;
  if (idx > 0 && !['.', '@'].includes(authority[idx - 1]!)) return null;
  return [from + idx, from + hostEnd];
}

function decodeSafe(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
