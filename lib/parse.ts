// Clasifica el texto de un código en un tipo de contenido reconocible.
// Las etiquetas de campo son claves de mensaje: la traducción la hace la interfaz.

import type { MessageKey } from '@/locales/messages';
import type { Code } from './decode';
import { parseDigitalLink, parseGs1, type Gs1Element } from './gs1';

type Field = { label: MessageKey; value: string };

export type Parsed =
  | { kind: 'url'; url: string; /** Si es un GS1 Digital Link, sus datos. */ gs1?: Gs1Element[] }
  | { kind: 'gs1'; elements: Gs1Element[]; rest?: string }
  | { kind: 'product'; gtin: string }
  | { kind: 'wifi'; ssid: string; password: string; security: string; hidden: boolean }
  | { kind: 'email'; to: string; subject: string; body: string }
  | { kind: 'tel'; number: string }
  | { kind: 'sms'; number: string; body: string }
  | { kind: 'geo'; lat: number; lon: number; query: string }
  | { kind: 'contact'; name: string; fields: Field[] }
  | { kind: 'sepa'; name: string; iban: string; bic: string; amount: string; reference: string }
  | { kind: 'text'; text: string };

/** Formatos cuyo contenido es un GTIN (número de producto). */
const PRODUCT_FORMATS = new Set(['EAN-13', 'EAN-8', 'UPC-A', 'UPC-E', 'ITF-14', 'ISBN']);

/** Interpreta un código leído teniendo en cuenta su formato y si zxing lo marcó como GS1. */
export function parseCode(code: Code): Parsed {
  if (code.gs1) {
    const { elements, rest } = parseGs1(code.raw ?? code.text);
    if (elements.length > 0) return { kind: 'gs1', elements, rest };
  }
  if (PRODUCT_FORMATS.has(code.format) && /^\d{8,14}$/.test(code.text)) return { kind: 'product', gtin: code.text };
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

  // Cualquier cosa con esquema (http, https, javascript, data...) se trata como URL
  // para que el análisis de seguridad la vea; lo que parece un dominio suelto no.
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/\s/.test(text)) {
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
  const [addr = '', query = ''] = text.slice(7).split('?');
  const params = new URLSearchParams(query);
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
    return { kind: 'sms', number: rest.slice(0, q), body: new URLSearchParams(rest.slice(q + 1)).get('body') ?? '' };
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
  const query = m[3] ? (new URLSearchParams(m[3]).get('q') ?? '') : '';
  return { kind: 'geo', lat, lon, query };
}

// EPC069-12 ("QR de pago SEPA"): líneas fijas tras la cabecera BCD.
function parseEpc(text: string): Parsed | null {
  const l = text.split(/\r?\n/);
  if (l.length < 7 || l[3] !== 'SCT') return null;
  const iban = (l[6] ?? '').replace(/\s/g, '');
  if (!iban) return null;
  const amount = (l[7] ?? '').replace(/^EUR/, '');
  return {
    kind: 'sepa',
    bic: l[4] ?? '',
    name: l[5] ?? '',
    iban,
    amount: amount ? `${amount} €` : '',
    reference: l[9] || l[10] || '',
  };
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
