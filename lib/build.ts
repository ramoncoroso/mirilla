// Constructores del contenido de un QR (generador, 4.4): de los campos de un formulario al texto que se codifica.
// Cada formato tiene sus escapes; se comprueban con ida y vuelta contra parseContent (tests/build.test.ts).
// Lógica pura: sin DOM ni zxing.

import { isValidIban } from './parse';

export type WifiSecurity = 'WPA' | 'WEP' | 'nopass';

export type BuildInput =
  | { kind: 'url'; url: string }
  | { kind: 'text'; text: string }
  | { kind: 'wifi'; ssid: string; password: string; security: WifiSecurity; hidden: boolean }
  | {
      kind: 'contact';
      firstName: string;
      lastName: string;
      org: string;
      title: string;
      phone: string;
      email: string;
      url: string;
      address: string;
      note: string;
    }
  | { kind: 'email'; to: string; subject: string; body: string }
  | { kind: 'tel'; number: string }
  | { kind: 'sms'; number: string; body: string }
  | { kind: 'geo'; lat: number; lon: number; query: string }
  | {
      kind: 'event';
      title: string;
      location: string;
      description: string;
      allDay: boolean;
      /** Día completo: "AAAA-MM-DD". Con hora: "AAAA-MM-DDTHH:MM" en hora local (lo que da `<input type=datetime-local>`). */
      start: string;
      /** Igual que `start`; vacío si no tiene fin. En día completo, el último día (incluido). */
      end: string;
    }
  | { kind: 'sepa'; name: string; iban: string; bic: string; /** "12,50" o "12.50"; vacío si lo pone quien paga. */ amount: string; reference: string };

export type BuildKind = BuildInput['kind'];

export type BuildError =
  | 'required'
  | 'invalidUrl'
  | 'unsafeScheme'
  | 'invalidPhone'
  | 'invalidEmail'
  | 'invalidCoords'
  | 'invalidDate'
  | 'endBeforeStart'
  | 'wifiPasswordLength'
  | 'ssidTooLong'
  | 'invalidIban'
  | 'invalidBic'
  | 'invalidAmount'
  | 'tooLong';

export type BuildResult = { ok: true; text: string } | { ok: false; error: BuildError; /** Campo del formulario al que se refiere. */ field: string };

const fail = (error: BuildError, field: string): BuildResult => ({ ok: false, error, field });
const ok = (text: string): BuildResult => ({ ok: true, text });

export function buildContent(input: BuildInput): BuildResult {
  switch (input.kind) {
    case 'url':
      return buildUrl(input.url);
    case 'text':
      return input.text.trim() ? ok(input.text) : fail('required', 'text');
    case 'wifi':
      return buildWifi(input);
    case 'contact':
      return buildVCard(input);
    case 'email':
      return buildEmail(input);
    case 'tel': {
      const number = cleanPhone(input.number);
      if (!input.number.trim()) return fail('required', 'number');
      return number ? ok(`tel:${number}`) : fail('invalidPhone', 'number');
    }
    case 'sms':
      return buildSms(input);
    case 'geo':
      return buildGeo(input);
    case 'event':
      return buildEvent(input);
    case 'sepa':
      return buildEpc(input);
  }
}

// --- Enlaces -----------------------------------------------------------------------------------

/**
 * Solo http(s): el generador no fabrica códigos `javascript:`, `data:` ni que abran otras aplicaciones (para eso,
 * «Texto»). Se devuelve la forma normalizada (host en punycode, minúsculas), la misma que analiza el lector.
 */
function buildUrl(raw: string): BuildResult {
  const text = raw.trim();
  if (!text) return fail('required', 'url');
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) && !/^[^:/]+:\d+(\/|$)/.test(text) ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return fail('invalidUrl', 'url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return fail('unsafeScheme', 'url');
  if (!url.hostname || /\s/.test(text)) return fail('invalidUrl', 'url');
  return ok(url.href);
}

// --- WiFi (formato de zxing: WIFI:T:WPA;S:red;P:clave;H:true;;) ---------------------------------

const escapeMeCard = (s: string) => s.replace(/[\\;,:"]/g, '\\$&');

function buildWifi(input: Extract<BuildInput, { kind: 'wifi' }>): BuildResult {
  if (!input.ssid) return fail('required', 'ssid');
  if (utf8Length(input.ssid) > 32) return fail('ssidTooLong', 'ssid');
  let text = `WIFI:T:${input.security};S:${escapeMeCard(input.ssid)};`;
  if (input.security !== 'nopass') {
    if (!input.password) return fail('required', 'password');
    // WPA: 8 a 63 caracteres, o 64 hexadecimales (la clave ya derivada).
    if (input.security === 'WPA' && !(input.password.length >= 8 && input.password.length <= 63) && !/^[0-9a-f]{64}$/i.test(input.password)) {
      return fail('wifiPasswordLength', 'password');
    }
    text += `P:${escapeMeCard(input.password)};`;
  }
  if (input.hidden) text += 'H:true;';
  return ok(`${text};`);
}

// --- Contacto (vCard 3.0, RFC 2426) -------------------------------------------------------------

const escapeVCard = (s: string) => oneLineBreaks(s).replace(/[\\,;]/g, '\\$&').replace(/\n/g, '\\n');

function buildVCard(input: Extract<BuildInput, { kind: 'contact' }>): BuildResult {
  const first = input.firstName.trim();
  const last = input.lastName.trim();
  const org = input.org.trim();
  if (!first && !last && !org) return fail('required', 'firstName');
  const phone = input.phone.trim() ? cleanPhone(input.phone) : '';
  if (input.phone.trim() && !phone) return fail('invalidPhone', 'phone');
  const email = input.email.trim();
  if (email && !isEmail(email)) return fail('invalidEmail', 'email');
  let web = '';
  if (input.url.trim()) {
    const url = buildUrl(input.url);
    if (!url.ok) return { ...url, field: 'url' };
    web = url.text;
  }

  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${escapeVCard(last)};${escapeVCard(first)};;;`];
  // FN es obligatorio en vCard 3.0: sin nombre, el de la empresa.
  lines.push(`FN:${escapeVCard([first, last].filter(Boolean).join(' ') || org)}`);
  if (org) lines.push(`ORG:${escapeVCard(org)}`);
  if (input.title.trim()) lines.push(`TITLE:${escapeVCard(input.title.trim())}`);
  if (phone) lines.push(`TEL:${phone}`);
  if (email) lines.push(`EMAIL:${escapeVCard(email)}`);
  if (web) lines.push(`URL:${web}`);
  if (input.address.trim()) lines.push(`ADR:;;${escapeVCard(input.address.trim())};;;;`);
  if (input.note.trim()) lines.push(`NOTE:${escapeVCard(input.note.trim())}`);
  lines.push('END:VCARD');
  return ok(lines.join('\r\n'));
}

// --- Email, teléfono y SMS -----------------------------------------------------------------------

function buildEmail(input: Extract<BuildInput, { kind: 'email' }>): BuildResult {
  const to = input.to.trim();
  if (!to) return fail('required', 'to');
  if (!isEmail(to)) return fail('invalidEmail', 'to');
  // RFC 6068: todo codificado salvo la arroba; los saltos de línea del cuerpo, como %0D%0A.
  const encode = (s: string) => encodeURIComponent(oneLineBreaks(s).replace(/\n/g, '\r\n'));
  const params: string[] = [];
  if (input.subject) params.push(`subject=${encode(input.subject)}`);
  if (input.body) params.push(`body=${encode(input.body)}`);
  const address = encodeURIComponent(to).replace(/%40/g, '@');
  return ok(`mailto:${address}${params.length ? `?${params.join('&')}` : ''}`);
}

function buildSms(input: Extract<BuildInput, { kind: 'sms' }>): BuildResult {
  if (!input.number.trim()) return fail('required', 'number');
  const number = cleanPhone(input.number);
  if (!number) return fail('invalidPhone', 'number');
  // SMSTO:número:mensaje es la forma que entienden más lectores de QR (la de zxing).
  const body = input.body.trim();
  return ok(body ? `SMSTO:${number}:${body}` : `SMSTO:${number}`);
}

/**
 * Número de teléfono sin espacios, guiones, puntos ni paréntesis; "+" solo al principio. Vacío si no es un número:
 * no se generan códigos USSD (`*#06#`, que el lector marca como peligrosos) ni con letras.
 */
export function cleanPhone(raw: string): string {
  const s = raw.trim().replace(/[\s\-.()/]/g, '');
  return /^\+?\d{2,20}$/.test(s) ? s : '';
}

const isEmail = (s: string) => /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/.test(s);

// --- Ubicación (geo:, RFC 5870) -----------------------------------------------------------------

function buildGeo(input: Extract<BuildInput, { kind: 'geo' }>): BuildResult {
  const { lat, lon } = input;
  if (!Number.isFinite(lat) || Math.abs(lat) > 90) return fail('invalidCoords', 'lat');
  if (!Number.isFinite(lon) || Math.abs(lon) > 180) return fail('invalidCoords', 'lon');
  const query = input.query.trim();
  return ok(`geo:${coord(lat)},${coord(lon)}${query ? `?q=${encodeURIComponent(query)}` : ''}`);
}

// Seis decimales (unos 10 cm) y sin notación científica, que el lector no acepta.
const coord = (n: number) => n.toFixed(6).replace(/\.?0+$/, '').replace(/^-0$/, '0');

// --- Evento (VEVENT, RFC 5545) ------------------------------------------------------------------

const escapeIcs = (s: string) => oneLineBreaks(s).replace(/[\\;,]/g, '\\$&').replace(/\n/g, '\\n');

function buildEvent(input: Extract<BuildInput, { kind: 'event' }>): BuildResult {
  const title = input.title.trim();
  if (!title) return fail('required', 'title');
  if (!input.start) return fail('required', 'start');
  const lines = ['BEGIN:VEVENT', `SUMMARY:${escapeIcs(title)}`];

  if (input.allDay) {
    const start = parseDay(input.start);
    if (!start) return fail('invalidDate', 'start');
    const end = input.end ? parseDay(input.end) : start;
    if (!end) return fail('invalidDate', 'end');
    if (end < start) return fail('endBeforeStart', 'end');
    lines.push(`DTSTART;VALUE=DATE:${icsDay(start)}`);
    // DTEND no se incluye (RFC 5545 §3.6.1): un día completo sin fin dura ese día. Con varios días, es el siguiente al último.
    if (end > start) lines.push(`DTEND;VALUE=DATE:${icsDay(new Date(end.getTime() + 86_400_000))}`);
  } else {
    const start = parseLocal(input.start);
    if (!start) return fail('invalidDate', 'start');
    lines.push(`DTSTART:${icsUtc(start)}`);
    if (input.end) {
      const end = parseLocal(input.end);
      if (!end) return fail('invalidDate', 'end');
      if (end < start) return fail('endBeforeStart', 'end');
      lines.push(`DTEND:${icsUtc(end)}`);
    }
  }

  if (input.location.trim()) lines.push(`LOCATION:${escapeIcs(input.location.trim())}`);
  if (input.description.trim()) lines.push(`DESCRIPTION:${escapeIcs(input.description.trim())}`);
  lines.push('END:VEVENT');
  return ok(lines.join('\r\n'));
}

// "AAAA-MM-DD" → medianoche UTC de ese día (solo se usa la fecha). Rechaza días que no existen (31 de abril).
function parseDay(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? d : null;
}

// "AAAA-MM-DDTHH:MM[:SS]" en hora local del equipo.
function parseLocal(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m || !parseDay(`${m[1]}-${m[2]}-${m[3]}`) || Number(m[4]) > 23 || Number(m[5]) > 59 || Number(m[6] ?? 0) > 59) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n: number) => String(n).padStart(2, '0');
const icsDay = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
const icsUtc = (d: Date) => `${icsDay(d)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

// --- Pago SEPA (EPC069-12, versión 002) ---------------------------------------------------------

function buildEpc(input: Extract<BuildInput, { kind: 'sepa' }>): BuildResult {
  const name = oneLine(input.name);
  if (!name) return fail('required', 'name');
  if (name.length > 70) return fail('tooLong', 'name');
  const iban = input.iban.toUpperCase().replace(/\s+/g, '');
  if (!iban) return fail('required', 'iban');
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban) || !isValidIban(iban)) return fail('invalidIban', 'iban');
  const bic = input.bic.toUpperCase().replace(/\s+/g, '');
  if (bic && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) return fail('invalidBic', 'bic');

  let amount = '';
  if (input.amount.trim()) {
    const m = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(input.amount.trim());
    if (!m) return fail('invalidAmount', 'amount');
    const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
    if (cents < 1) return fail('invalidAmount', 'amount');
    amount = `EUR${Math.floor(cents / 100)}.${pad(cents % 100)}`;
  }

  // Referencia estructurada ISO 11649 (RF…, línea 9) o texto libre (línea 10), nunca las dos.
  const reference = oneLine(input.reference);
  const structured = /^RF\d{2}[A-Z0-9]{1,21}$/i.test(reference.replace(/\s+/g, '')) ? reference.replace(/\s+/g, '').toUpperCase() : '';
  if (!structured && reference.length > 140) return fail('tooLong', 'reference');

  const lines = ['BCD', '002', '1', 'SCT', bic, name, iban, amount, '', structured, structured ? '' : reference];
  while (lines[lines.length - 1] === '') lines.pop();
  const text = lines.join('\n');
  // El estándar limita el código entero a 331 bytes.
  return utf8Length(text) > 331 ? fail('tooLong', 'reference') : ok(text);
}

// --- Utilidades ----------------------------------------------------------------------------------

const oneLineBreaks = (s: string) => s.replace(/\r\n?/g, '\n');
const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();
const utf8Length = (s: string) => new TextEncoder().encode(s).length;
