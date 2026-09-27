// Análisis local de una URL leída de un código, pensado contra el "quishing".
// No consulta ningún servicio: solo heurísticas sobre la propia URL.

export type Level = 'danger' | 'warn' | 'info';
export interface Finding {
  level: Level;
  message: string;
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
    return { openable: false, host: '', findings: [{ level: 'danger', message: 'La URL no es válida.' }] };
  }

  const findings: Finding[] = [];
  const scheme = url.protocol.toLowerCase();

  if (DANGEROUS_SCHEMES.has(scheme)) {
    return {
      openable: false,
      host: '',
      findings: [{ level: 'danger', message: `Esquema «${scheme}» peligroso: puede ejecutar código o incrustar contenido. No se abrirá.` }],
    };
  }
  if (scheme !== 'http:' && scheme !== 'https:') {
    return {
      openable: false,
      host: url.host,
      findings: [{ level: 'warn', message: `Esquema «${scheme}» no web: abriría otra aplicación.` }],
    };
  }

  const host = url.hostname.toLowerCase();

  if (url.username || url.password) {
    findings.push({
      level: 'danger',
      message: `Contiene «${url.username}@» antes del dominio: el destino real es ${host}, no lo que aparece al principio.`,
    });
  }
  if (host.split('.').some((label) => label.startsWith('xn--'))) {
    findings.push({
      level: 'danger',
      message: 'Dominio con caracteres internacionales (punycode). Puede imitar a otro dominio con letras parecidas.',
    });
  }
  if (isIpAddress(host)) {
    findings.push({ level: 'warn', message: 'Apunta a una dirección IP en lugar de a un dominio.' });
  }
  if (scheme === 'http:') {
    findings.push({ level: 'warn', message: 'Conexión sin cifrar (http).' });
  }
  if (SHORTENERS.has(host.replace(/^www\./, ''))) {
    findings.push({ level: 'info', message: 'Es un acortador o redirector: el destino final no se ve hasta abrirlo.' });
  }
  if (url.port && url.port !== '80' && url.port !== '443') {
    findings.push({ level: 'info', message: `Usa un puerto poco habitual (${url.port}).` });
  }
  if (host.split('.').length > 5) {
    findings.push({ level: 'warn', message: 'Tiene muchos subdominios; revisa cuál es el dominio real (el final).' });
  }
  if (/(^|[.-])(login|signin|verify|secure|account|update|banking)([.-]|$)/.test(host) && findings.length > 0) {
    findings.push({ level: 'warn', message: 'El dominio contiene palabras típicas de phishing.' });
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
