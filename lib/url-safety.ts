// Análisis local de una URL leída de un código, pensado contra el "quishing".
// No consulta ningún servicio: solo heurísticas sobre la propia URL.
// Devuelve claves de mensaje (la traducción la hace la interfaz) para poder testearlo sin navegador.

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
  /** Host tal como lo verá el navegador (punycode si aplica). */
  host: string;
  findings: Finding[];
}

const SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'cutt.ly', 'rebrand.ly',
  'shorturl.at', 'tiny.cc', 'rb.gy', 'bl.ink', 'lnkd.in', 's.id', 'v.gd', 'qrco.de', 'qr.link',
  'qrs.ly', 'scan.page', 'l.ead.me', 'short.io', 'shorturl.asia', 'y2u.be', 'urlz.fr', 'surl.li',
]);

const DANGEROUS_SCHEMES = new Set(['javascript:', 'data:', 'vbscript:', 'file:', 'blob:', 'filesystem:']);

export function analyzeUrl(raw: string): UrlReport {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { openable: false, host: '', findings: [{ level: 'danger', message: 'urlInvalid' }] };
  }

  const findings: Finding[] = [];
  const scheme = url.protocol.toLowerCase();

  if (DANGEROUS_SCHEMES.has(scheme)) {
    return {
      openable: false,
      host: '',
      findings: [{ level: 'danger', message: 'urlDangerousScheme', args: [scheme] }],
    };
  }
  if (scheme !== 'http:' && scheme !== 'https:') {
    return {
      openable: false,
      host: url.host,
      findings: [{ level: 'warn', message: 'urlNonWebScheme', args: [scheme] }],
    };
  }

  const host = url.hostname.toLowerCase();

  if (url.username || url.password) {
    findings.push({ level: 'danger', message: 'urlUserinfo', args: [url.username, host] });
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
  if (SHORTENERS.has(host.replace(/^www\./, ''))) {
    findings.push({ level: 'info', message: 'urlShortener' });
  }
  if (url.port && url.port !== '80' && url.port !== '443') {
    findings.push({ level: 'info', message: 'urlPort', args: [url.port] });
  }
  if (host.split('.').length > 5) {
    findings.push({ level: 'warn', message: 'urlSubdomains' });
  }
  if (/(^|[.-])(login|signin|verify|secure|account|update|banking)([.-]|$)/.test(host) && findings.length > 0) {
    findings.push({ level: 'warn', message: 'urlPhishingWords' });
  }

  return { openable: true, host, findings };
}

function isIpAddress(host: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[');
}

/** Dominio "registrable" aproximado, para resaltarlo en la interfaz. */
export function mainDomain(host: string): string {
  if (isIpAddress(host)) return host;
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  // Sufijos de dos niveles frecuentes (co.uk, com.es...). Heurística, no la lista PSL completa.
  const sld = parts.at(-2) ?? '';
  const tld = parts.at(-1) ?? '';
  const twoLevel = ['co', 'com', 'org', 'net', 'gov', 'gob', 'edu', 'ac', 'nom'].includes(sld) && tld.length === 2;
  return parts.slice(twoLevel ? -3 : -2).join('.');
}
