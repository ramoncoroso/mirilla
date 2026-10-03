// Clasifica el texto de un código en un tipo de contenido reconocible.
// Las etiquetas de campo son claves de mensaje: la traducción la hace la interfaz.

import type { MessageKey } from '@/locales/messages';
import { isEthereumAddressFormat, isValidBitcoinAddress } from './crypto-address';
import type { Code } from './decode';
import { parseDigitalLink, parseGs1, type Gs1Element } from './gs1';

type Field = { label: MessageKey; value: string };

export type Parsed =
  | { kind: 'url'; url: string; /** Si es un GS1 Digital Link, sus datos. */ gs1?: Gs1Element[] }
  | { kind: 'gs1'; elements: Gs1Element[]; rest?: string }
  | { kind: 'product'; gtin: string; /** Añadido EAN-2/EAN-5 (número de ejemplar o precio), si lo había y se pudo leer. */ addOn?: string }
  | { kind: 'wifi'; ssid: string; password: string; security: string; hidden: boolean }
  | { kind: 'email'; to: string; subject: string; body: string }
  | { kind: 'tel'; number: string }
  | { kind: 'sms'; number: string; body: string }
  | { kind: 'geo'; lat: number; lon: number; query: string }
  | { kind: 'contact'; name: string; fields: Field[] }
  | { kind: 'sepa'; name: string; iban: string; ibanValid: boolean; bic: string; /** En euros, p. ej. "12.50" (vacío si no lo indica). */ amount: string; reference: string }
  | { kind: 'event'; title: string; start?: EventTime; end?: EventTime; location: string; description: string; /** El VEVENT (o VCALENDAR) original, para el .ics. */ ics: string }
  | { kind: 'otp'; type: 'totp' | 'hotp'; issuer: string; account: string; secret: string; algorithm: string; digits: number; period: number; counter?: number }
  | {
      kind: 'crypto';
      coin: 'bitcoin' | 'ethereum' | 'lightning';
      /** Dirección (o factura Lightning). */
      address: string;
      /** Checksum correcto (Bitcoin: Base58Check o Bech32/Bech32m); null si no se puede comprobar. */
      addressValid: boolean | null;
      /** Importe tal como viene (BTC en BIP 21; en Ethereum, el `value` en wei). */
      amount: string;
      label: string;
      message: string;
    }
  | { kind: 'text'; text: string };

/** Fecha de un evento: `iso` sin zona si es hora local de `tz` («2026-10-03T10:00:00»), con Z si es UTC, o solo fecha. */
export interface EventTime {
  iso: string;
  allDay: boolean;
  /** Zona IANA del TZID, 'UTC', o '' si es hora «flotante» (la del que lo mira). */
  tz: string;
}

/** Formatos cuyo contenido es un GTIN (número de producto). */
const PRODUCT_FORMATS = new Set(['EAN-13', 'EAN-8', 'UPC-A', 'UPC-E', 'ITF-14', 'ISBN']);

/** Interpreta un código leído teniendo en cuenta su formato y si zxing lo marcó como GS1. */
export function parseCode(code: Code): Parsed {
  if (code.gs1) {
    const { elements, rest } = parseGs1(code.raw ?? code.text);
    if (elements.length > 0) return { kind: 'gs1', elements, rest };
  }
  if (PRODUCT_FORMATS.has(code.format) && /^\d{8,14}$/.test(code.text)) {
    // UPC-E es un UPC-A comprimido: el GTIN (y su prefijo GS1) es el de 12 dígitos.
    const gtin = code.format === 'UPC-E' ? (expandUpcE(code.text) ?? code.text) : code.text;
    return { kind: 'product', gtin, ...(code.addOn ? { addOn: code.addOn } : {}) };
  }
  const parsed = parseContent(code.text);
  if (parsed.kind === 'url') {
    const gs1 = parseDigitalLink(parsed.url);
    if (gs1) return { ...parsed, gs1 };
  }
  return parsed;
}

export function parseContent(raw: string): Parsed {
  const text = raw.trim();
  const lower = text.toLowerCase();

  if (lower.startsWith('wifi:')) return parseWifi(text) ?? { kind: 'text', text: raw };
  if (lower.startsWith('begin:vcard')) return parseVCard(text);
  if (lower.startsWith('mecard:')) return parseMeCard(text);
  if (lower.startsWith('matmsg:')) return parseMatMsg(text);
  if (lower.startsWith('mailto:')) return parseMailto(text);
  if (lower.startsWith('tel:')) return { kind: 'tel', number: text.slice(4).trim() };
  if (lower.startsWith('sms:') || lower.startsWith('smsto:')) return parseSms(text);
  if (lower.startsWith('geo:')) return parseGeo(text) ?? { kind: 'text', text: raw };
  if (text.startsWith('BCD\n') || text.startsWith('BCD\r\n')) return parseEpc(text) ?? { kind: 'text', text: raw };
  if (lower.startsWith('begin:vevent') || lower.startsWith('begin:vcalendar')) return parseEvent(text) ?? { kind: 'text', text: raw };
  if (lower.startsWith('otpauth://totp/') || lower.startsWith('otpauth://hotp/')) {
    const otp = parseOtp(text);
    // Sin `secret` no hay nada que mostrar como OTP: que pase por el análisis de enlaces, como antes.
    if (otp) return otp;
  }
  if (lower.startsWith('bitcoin:')) {
    const btc = parseBitcoin(text);
    if (btc) return btc;
  }
  if (lower.startsWith('lightning:')) {
    return { kind: 'crypto', coin: 'lightning', address: text.slice('lightning:'.length), addressValid: null, amount: '', label: '', message: '' };
  }
  if (lower.startsWith('ethereum:')) {
    const eth = parseEthereum(text);
    if (eth) return eth;
  }

  // Los esquemas web, los peligrosos y los que abren otras aplicaciones se tratan como URL para que
  // pasen por el análisis de seguridad. Otros "X:valor" (SN:ABC123, Lote:42) son texto normal.
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(text)?.[1]?.toLowerCase();
  if (scheme && URL_SCHEMES.has(scheme) && !/\s/.test(text)) {
    try {
      new URL(text);
      return { kind: 'url', url: text };
    } catch {
      /* no es una URL válida */
    }
  }
  if (/^www\.[^\s]+\.[a-z]{2,}(\/\S*)?$/i.test(text)) return { kind: 'url', url: `https://${text}` };

  return { kind: 'text', text: raw };
}

const URL_SCHEMES = new Set([
  'http', 'https', 'javascript', 'data', 'vbscript', 'file', 'blob', 'filesystem',
  'ftp', 'ftps', 'intent', 'market', 'itms-services', 'itms-apps', 'facetime', 'facetime-audio',
  'skype', 'whatsapp', 'tg', 'zoommtg', 'otpauth', 'bitcoin', 'ethereum', 'spotify', 'sip',
]);

/** Expande un UPC-E (8 dígitos) a su UPC-A (12), según la tabla de la especificación. */
export function expandUpcE(upce: string): string | null {
  if (!/^[01]\d{7}$/.test(upce)) return null;
  const [ns, d1, d2, d3, d4, d5, d6, check] = upce.split('') as [string, string, string, string, string, string, string, string];
  let body: string;
  if (d6 === '0' || d6 === '1' || d6 === '2') body = `${d1}${d2}${d6}0000${d3}${d4}${d5}`;
  else if (d6 === '3') body = `${d1}${d2}${d3}00000${d4}${d5}`;
  else if (d6 === '4') body = `${d1}${d2}${d3}${d4}00000${d5}`;
  else body = `${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  return `${ns}${body}${check}`;
}

/** Lo que dice un añadido EAN-2/EAN-5: el precio recomendado (libros Bookland) o el número de ejemplar (publicaciones). */
export type AddOnInfo = { type: 'price'; currency: 'USD' | 'GBP'; amount: number } | { type: 'issue'; n: number };

/**
 * Interpreta un añadido EAN-2/EAN-5 según su longitud y, para el precio, el prefijo del GTIN:
 * - 2 dígitos: número de ejemplar de una publicación periódica (cualquier GTIN).
 * - 5 dígitos, solo en libros Bookland (GTIN 978/979): empieza por 5 → precio en USD (resto ÷ 100);
 *   por 0 → en GBP; por 9 (90000-98999) → uso interno, sin precio que mostrar.
 * Cualquier otro caso (5 dígitos sin ser Bookland, u otro dígito inicial) no tiene interpretación conocida.
 */
export function interpretAddOn(gtin: string, addOn: string): AddOnInfo | null {
  if (/^\d{2}$/.test(addOn)) return { type: 'issue', n: Number(addOn) };
  if (/^\d{5}$/.test(addOn) && /^97[89]/.test(gtin)) {
    const first = addOn[0];
    const amount = Number(addOn.slice(1)) / 100;
    if (first === '5') return { type: 'price', currency: 'USD', amount };
    if (first === '0') return { type: 'price', currency: 'GBP', amount };
  }
  return null;
}

/** Valida un IBAN con el algoritmo ISO 13616 (módulo 97). */
export function isValidIban(iban: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const moved = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const ch of moved) {
    const n = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const digit of n) rest = (rest * 10 + Number(digit)) % 97;
  }
  return rest === 1;
}

/**
 * Parámetros de una query de mailto:/sms:/geo:. A diferencia de URLSearchParams, "+" es literal (RFC 6068):
 * "subject=1+1" es "1+1", no "1 1".
 */
function queryParams(query: string): Map<string, string> {
  const params = new Map<string, string>();
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = safeDecode(eq < 0 ? pair : pair.slice(0, eq)).toLowerCase();
    if (!params.has(key)) params.set(key, eq < 0 ? '' : safeDecode(pair.slice(eq + 1)));
  }
  return params;
}

// Divide "K:v;K:v;;" respetando los escapes \; \: \, \\ de MECARD/WIFI.
function splitFields(body: string): [string, string][] {
  const fields: [string, string][] = [];
  let cur = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '\\' && i + 1 < body.length) {
      cur += c + body[++i];
    } else if (c === ';') {
      if (cur) fields.push(splitKey(cur));
      cur = '';
    } else {
      cur += c;
    }
  }
  if (cur) fields.push(splitKey(cur));
  return fields;
}

function splitKey(field: string): [string, string] {
  const idx = field.search(/(?<!\\):/);
  if (idx < 0) return [field.toUpperCase(), ''];
  return [field.slice(0, idx).toUpperCase(), unescape(field.slice(idx + 1))];
}

function unescape(s: string) {
  return s.replace(/\\(.)/g, '$1');
}

function parseWifi(text: string): Parsed | null {
  const fields = new Map(splitFields(text.slice(5)));
  const ssid = fields.get('S');
  if (ssid === undefined) return null;
  return {
    kind: 'wifi',
    ssid,
    password: fields.get('P') ?? '',
    security: fields.get('T') || 'nopass',
    hidden: (fields.get('H') ?? '').toLowerCase() === 'true',
  };
}

function parseMeCard(text: string): Parsed {
  const labels: Record<string, MessageKey> = {
    TEL: 'fieldPhone',
    EMAIL: 'fieldEmail',
    ADR: 'fieldAddress',
    URL: 'fieldWeb',
    NOTE: 'fieldNote',
    BDAY: 'fieldBirthday',
    ORG: 'fieldCompany',
  };
  let name = '';
  const fields: Field[] = [];
  for (const [k, v] of splitFields(text.slice(7))) {
    if (k === 'N') name = v.split(',').reverse().join(' ').trim();
    else if (labels[k] && v) fields.push({ label: labels[k], value: v });
  }
  return { kind: 'contact', name, fields };
}

function parseVCard(text: string): Parsed {
  const labels: Record<string, MessageKey> = {
    TEL: 'fieldPhone',
    EMAIL: 'fieldEmail',
    ORG: 'fieldCompany',
    TITLE: 'fieldJobTitle',
    URL: 'fieldWeb',
    ADR: 'fieldAddress',
    NOTE: 'fieldNote',
  };
  // Las líneas que empiezan por espacio continúan la anterior (RFC 6350 §3.2).
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  let name = '';
  let structuredName = '';
  const fields: Field[] = [];
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const prop = (line.slice(0, idx).split(';')[0] ?? '').split('.').pop()!.toUpperCase();
    const value = line.slice(idx + 1).replace(/\\n/gi, ' ').replace(/\\(.)/g, '$1');
    if (prop === 'FN') name = value;
    else if (prop === 'N') structuredName = value.split(';').slice(0, 2).reverse().join(' ').trim();
    else if (labels[prop]) {
      const v = prop === 'ADR' ? value.split(';').filter(Boolean).join(', ') : value;
      if (v) fields.push({ label: labels[prop], value: v });
    }
  }
  return { kind: 'contact', name: name || structuredName, fields };
}

function parseMatMsg(text: string): Parsed {
  const fields = new Map(splitFields(text.slice(7)));
  return {
    kind: 'email',
    to: fields.get('TO') ?? '',
    subject: fields.get('SUB') ?? '',
    body: fields.get('BODY') ?? '',
  };
}

function parseMailto(text: string): Parsed {
  const q = text.indexOf('?');
  const addr = q < 0 ? text.slice(7) : text.slice(7, q);
  const params = queryParams(q < 0 ? '' : text.slice(q + 1));
  return {
    kind: 'email',
    to: safeDecode(addr),
    subject: params.get('subject') ?? '',
    body: params.get('body') ?? '',
  };
}

function parseSms(text: string): Parsed {
  const rest = text.slice(text.indexOf(':') + 1);
  // smsto:NUM:MENSAJE  |  sms:NUM?body=MENSAJE
  const q = rest.indexOf('?');
  if (q >= 0) {
    return { kind: 'sms', number: rest.slice(0, q), body: queryParams(rest.slice(q + 1)).get('body') ?? '' };
  }
  const c = rest.indexOf(':');
  if (c >= 0) return { kind: 'sms', number: rest.slice(0, c), body: rest.slice(c + 1) };
  return { kind: 'sms', number: rest, body: '' };
}

function parseGeo(text: string): Parsed | null {
  const m = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,[^?;]*)?(?:;[^?]*)?(?:\?(.*))?$/i.exec(text);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const query = m[3] ? (queryParams(m[3]).get('q') ?? '') : '';
  return { kind: 'geo', lat, lon, query };
}

// EPC069-12 ("QR de pago SEPA"): líneas fijas tras la cabecera BCD.
function parseEpc(text: string): Parsed | null {
  const l = text.split(/\r?\n/);
  if (l.length < 7 || l[3] !== 'SCT') return null;
  // Solo letras y dígitos: cualquier otro carácter (espacios, invisibles, controles bidi) se descarta del IBAN.
  const iban = (l[6] ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!iban) return null;
  const amount = /^EUR(\d+(?:\.\d{1,2})?)$/.exec((l[7] ?? '').trim())?.[1] ?? '';
  return {
    kind: 'sepa',
    bic: l[4] ?? '',
    name: l[5] ?? '',
    iban,
    ibanValid: isValidIban(iban),
    amount,
    reference: l[9] || l[10] || '',
  };
}

// --- Eventos (iCalendar / VEVENT, RFC 5545) ----------------------------------------------------

interface IcsLine {
  name: string;
  params: Map<string, string>;
  value: string;
}

// "NAME;PARAM=V;PARAM2=V2:value" → nombre, parámetros y valor. No contempla valores entre comillas
// con ":" dentro (ALTREP...), que no usamos.
function parseIcsLine(line: string): IcsLine | null {
  const idx = line.indexOf(':');
  if (idx < 0) return null;
  const [namePart, ...paramParts] = line.slice(0, idx).split(';');
  const params = new Map<string, string>();
  for (const p of paramParts) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    params.set(p.slice(0, eq).toUpperCase(), p.slice(eq + 1));
  }
  return { name: (namePart ?? '').toUpperCase(), params, value: line.slice(idx + 1) };
}

// Desescapa un valor TEXT de iCalendar: \n y \N son salto de línea; \, \; \\ son el carácter literal.
function unescapeIcsText(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) {
      const next = s[++i];
      out += next === 'n' || next === 'N' ? '\n' : next;
    } else {
      out += c;
    }
  }
  return out;
}

function isValidDateParts(y: number, mo: number, d: number): boolean {
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

function isValidTimeParts(hh: number, mi: number, ss: number): boolean {
  return hh <= 23 && mi <= 59 && ss <= 60; // 60: segundo intercalar
}

// DTSTART/DTEND: fecha sola (VALUE=DATE), UTC ("...Z"), con TZID, o "flotante" (sin zona).
function parseIcsDate(value: string, params: Map<string, string>): EventTime | undefined {
  const v = value.trim();
  if (params.get('VALUE') === 'DATE' || /^\d{8}$/.test(v)) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
    if (!m) return undefined;
    const [, y, mo, d] = m as unknown as [string, string, string, string];
    if (!isValidDateParts(Number(y), Number(mo), Number(d))) return undefined;
    return { iso: `${y}-${mo}-${d}`, allDay: true, tz: '' };
  }
  const mUtc = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(v);
  if (mUtc) {
    const [, y, mo, d, hh, mi, ss] = mUtc as unknown as [string, string, string, string, string, string, string];
    if (!isValidDateParts(Number(y), Number(mo), Number(d)) || !isValidTimeParts(Number(hh), Number(mi), Number(ss))) return undefined;
    return { iso: `${y}-${mo}-${d}T${hh}:${mi}:${ss}Z`, allDay: false, tz: 'UTC' };
  }
  const mLocal = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(v);
  if (mLocal) {
    const [, y, mo, d, hh, mi, ss] = mLocal as unknown as [string, string, string, string, string, string, string];
    if (!isValidDateParts(Number(y), Number(mo), Number(d)) || !isValidTimeParts(Number(hh), Number(mi), Number(ss))) return undefined;
    return { iso: `${y}-${mo}-${d}T${hh}:${mi}:${ss}`, allDay: false, tz: params.get('TZID') ?? '' };
  }
  return undefined;
}

// Envuelve un VEVENT suelto (sin VCALENDAR) para poder ofrecerlo como .ics descargable.
function wrapIcs(vevent: string): string {
  const body = vevent.replace(/\r\n|\r|\n/g, '\r\n').trim();
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Mirilla//ES\r\n${body}\r\nEND:VCALENDAR`;
}

function parseEvent(text: string): Parsed | null {
  // Desplegado de líneas (RFC 5545 §3.1): un salto de línea seguido de espacio o tabulador
  // continúa la línea anterior; se quitan ambos (el salto y ese espacio/tab).
  const unfolded = text.replace(/\r\n|\r|\n/g, '\n').replace(/\n[ \t]/g, '');
  const lines = unfolded.split('\n');
  const start = lines.findIndex((l) => /^BEGIN:VEVENT$/i.test(l.trim()));
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && /^END:VEVENT$/i.test(l.trim()));
  if (end < 0) return null;

  let title = '';
  let location = '';
  let description = '';
  let dtstart: EventTime | undefined;
  let dtend: EventTime | undefined;
  for (const raw of lines.slice(start + 1, end)) {
    const prop = parseIcsLine(raw);
    if (!prop) continue;
    switch (prop.name) {
      case 'SUMMARY':
        title = unescapeIcsText(prop.value);
        break;
      case 'LOCATION':
        location = unescapeIcsText(prop.value);
        break;
      case 'DESCRIPTION':
        description = unescapeIcsText(prop.value);
        break;
      case 'DTSTART':
        dtstart = parseIcsDate(prop.value, prop.params);
        break;
      case 'DTEND':
        dtend = parseIcsDate(prop.value, prop.params);
        break;
      default:
        break;
    }
  }

  const isBareVevent = /^begin:vevent/i.test(text.trim());
  return {
    kind: 'event',
    title,
    location,
    description,
    start: dtstart,
    end: dtend,
    ics: isBareVevent ? wrapIcs(text) : text,
  };
}

// --- OTP (otpauth://, Google Authenticator "Key URI Format") ------------------------------------

function parseOtp(text: string): Parsed | null {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const type = url.host.toLowerCase();
  if (type !== 'totp' && type !== 'hotp') return null;
  const secretRaw = url.searchParams.get('secret');
  if (!secretRaw) return null;
  const secret = secretRaw.toUpperCase().replace(/\s+/g, '');

  const label = safeDecode(url.pathname.replace(/^\/+/, ''));
  const sep = label.indexOf(':');
  let issuer = sep < 0 ? '' : label.slice(0, sep).trim();
  const account = sep < 0 ? label : label.slice(sep + 1).trim();
  issuer = url.searchParams.get('issuer') || issuer;

  const algorithm = (url.searchParams.get('algorithm') || 'SHA1').toUpperCase();
  const digits = Number(url.searchParams.get('digits')) || 6;
  const period = Number(url.searchParams.get('period')) || 30;
  const counterParam = url.searchParams.get('counter');

  return {
    kind: 'otp',
    type,
    issuer,
    account,
    secret,
    algorithm,
    digits,
    period,
    counter: type === 'hotp' ? Number(counterParam ?? 0) : undefined,
  };
}

// --- Criptomonedas (BIP 21 Bitcoin, Lightning, EIP-681 Ethereum) --------------------------------

function parseBitcoin(text: string): Parsed | null {
  const rest = text.slice('bitcoin:'.length);
  const q = rest.indexOf('?');
  const address = (q < 0 ? rest : rest.slice(0, q)).trim();
  if (!address) return null;
  const params = queryParams(q < 0 ? '' : rest.slice(q + 1));
  return {
    kind: 'crypto',
    coin: 'bitcoin',
    address,
    addressValid: isValidBitcoinAddress(address),
    amount: params.get('amount') ?? '',
    label: params.get('label') ?? '',
    message: params.get('message') ?? '',
  };
}

// EIP-681: "ethereum:[pay-]0xDIRECCION[@chainId][/function]?value=...". No interpretamos llamadas
// a funciones (tokens ERC-20 etc.), solo el pago directo en ether.
function parseEthereum(text: string): Parsed | null {
  const rest = text.slice('ethereum:'.length);
  const m = /^(?:pay-)?(0x[0-9a-fA-F]+)(?:@\d+)?(?:\/[^?]*)?(?:\?(.*))?$/.exec(rest);
  if (!m) return null;
  const address = m[1] ?? '';
  const params = queryParams(m[2] ?? '');
  return {
    kind: 'crypto',
    coin: 'ethereum',
    address,
    addressValid: isEthereumAddressFormat(address),
    amount: params.get('value') ?? '',
    label: '',
    message: '',
  };
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
