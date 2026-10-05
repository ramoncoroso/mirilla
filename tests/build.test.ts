// Constructores del contenido de un QR (4.4): ida y vuelta entre buildContent y parseContent.
// Para cada tipo se comprueba que el texto generado es el esperado y que, al analizarlo, se recupera lo mismo.

import { describe, expect, it } from 'vitest';
import { buildContent, type BuildInput } from '@/lib/build';
import { parseContent } from '@/lib/parse';

/** Azúcar: construye y espera éxito, devolviendo el texto. */
function buildOk(input: BuildInput): string {
  const r = buildContent(input);
  expect(r.ok).toBe(true);
  return r.ok ? r.text : '';
}

/** Azúcar: construye y espera un error concreto (y opcionalmente el campo). */
function expectFail(input: BuildInput, error: string, field?: string) {
  const r = buildContent(input);
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.error).toBe(error);
    if (field !== undefined) expect(r.field).toBe(field);
  }
}

describe('buildContent: url', () => {
  it('añade https:// y la barra final', () => {
    const text = buildOk({ kind: 'url', url: 'example.com' });
    expect(text).toBe('https://example.com/');
    expect(parseContent(text).kind).toBe('url');
  });

  it('conserva una URL completa con query y fragmento', () => {
    const text = buildOk({ kind: 'url', url: 'http://a.b/c?d=1#e' });
    expect(text).toBe('http://a.b/c?d=1#e');
    expect(parseContent(text).kind).toBe('url');
  });

  it('host con puerto: no lo confunde con un esquema', () => {
    const text = buildOk({ kind: 'url', url: 'localhost:8080/x' });
    expect(text).toBe('https://localhost:8080/x');
    expect(parseContent(text).kind).toBe('url');
  });

  it('normaliza el host a punycode (IDN) y minúsculas', () => {
    const text = buildOk({ kind: 'url', url: 'https://Bücher.example/' });
    expect(text).toBe('https://xn--bcher-kva.example/');
    expect(parseContent(text).kind).toBe('url');
  });

  it('rechaza esquemas peligrosos o que no son http(s)', () => {
    expectFail({ kind: 'url', url: 'javascript:alert(1)' }, 'unsafeScheme', 'url');
    expectFail({ kind: 'url', url: 'data:text/html,x' }, 'unsafeScheme', 'url');
    expectFail({ kind: 'url', url: 'mailto:a@b.c' }, 'unsafeScheme', 'url');
    expectFail({ kind: 'url', url: 'file:///etc/passwd' }, 'unsafeScheme', 'url');
  });

  it('vacío → required; con espacios en el host → invalidUrl', () => {
    expectFail({ kind: 'url', url: '' }, 'required', 'url');
    expectFail({ kind: 'url', url: 'https://exa mple.com' }, 'invalidUrl', 'url');
  });
});

describe('buildContent: text', () => {
  it('conserva texto multilínea con Unicode y emoji tal cual', () => {
    const original = 'Línea 1\nΕλλάδα 🙂\nLínea 3';
    const text = buildOk({ kind: 'text', text: original });
    expect(text).toBe(original);
    const parsed = parseContent(text);
    expect(parsed).toEqual({ kind: 'text', text: original });
  });

  it('solo espacios → required', () => {
    expectFail({ kind: 'text', text: '   ' }, 'required', 'text');
  });
});

describe('buildContent: wifi', () => {
  it('escapa ; : , \\ " en SSID y clave, y los recupera igual', () => {
    const ssid = 'Casa;Pepe:"5G"\\';
    const password = 'a;b,c:d\\e"f';
    const text = buildOk({ kind: 'wifi', ssid, password, security: 'WPA', hidden: true });
    const parsed = parseContent(text);
    expect(parsed).toMatchObject({ kind: 'wifi', ssid, password, security: 'WPA', hidden: true });
  });

  it('nopass no lleva "P:"', () => {
    const text = buildOk({ kind: 'wifi', ssid: 'Libre', password: '', security: 'nopass', hidden: false });
    expect(text).not.toContain('P:');
    expect(parseContent(text)).toMatchObject({ kind: 'wifi', ssid: 'Libre', security: 'nopass' });
  });

  it('WPA: clave de 7 caracteres es demasiado corta', () => {
    expectFail({ kind: 'wifi', ssid: 'Red', password: '1234567', security: 'WPA', hidden: false }, 'wifiPasswordLength', 'password');
  });

  it('WPA: clave de 64 hexadecimales (PSK derivada) es válida', () => {
    const password = 'a'.repeat(64);
    const text = buildOk({ kind: 'wifi', ssid: 'Red', password, security: 'WPA', hidden: false });
    expect(parseContent(text)).toMatchObject({ kind: 'wifi', password });
  });

  it('WPA: 63 caracteres es válida', () => {
    const password = 'x'.repeat(63);
    const text = buildOk({ kind: 'wifi', ssid: 'Red', password, security: 'WPA', hidden: false });
    expect(parseContent(text)).toMatchObject({ kind: 'wifi', password });
  });

  it('WPA: 64 caracteres no hexadecimales es inválida', () => {
    expectFail({ kind: 'wifi', ssid: 'Red', password: 'z'.repeat(64), security: 'WPA', hidden: false }, 'wifiPasswordLength', 'password');
  });

  it('SSID de más de 32 bytes UTF-8 (11 "€" = 33 bytes) → ssidTooLong', () => {
    expectFail({ kind: 'wifi', ssid: '€'.repeat(11), password: 'password', security: 'WPA', hidden: false }, 'ssidTooLong', 'ssid');
  });

  it('WEP acepta cualquier longitud de clave', () => {
    const text = buildOk({ kind: 'wifi', ssid: 'Red', password: '1234', security: 'WEP', hidden: false });
    expect(parseContent(text)).toMatchObject({ kind: 'wifi', security: 'WEP', password: '1234' });
  });

  it('hidden:true se analiza como hidden true', () => {
    const text = buildOk({ kind: 'wifi', ssid: 'Red', password: 'password', security: 'WPA', hidden: true });
    expect(parseContent(text)).toMatchObject({ hidden: true });
  });
});

describe('buildContent: contact', () => {
  const base = { firstName: '', lastName: '', org: '', title: '', phone: '', email: '', url: '', address: '', note: '' };

  it('nombre, apellido con coma, empresa, cargo, teléfono, email, url, dirección y nota; empieza por BEGIN:VCARD', () => {
    const input: BuildInput = {
      kind: 'contact',
      ...base,
      firstName: 'José',
      lastName: 'García, Jr.',
      org: 'Acme; S.L.',
      title: 'Director',
      phone: '+34 600 11-22-33',
      email: 'jose@example.com',
      url: 'acme.example',
      address: 'C/ Mayor, 1 - 2ºB',
      note: 'nota simple',
    };
    const text = buildOk(input);
    expect(text.startsWith('BEGIN:VCARD\r\nVERSION:3.0')).toBe(true);
    expect(text).toContain('TEL:+34600112233');
    expect(text).toContain('URL:https://acme.example/');

    const parsed = parseContent(text);
    expect(parsed.kind).toBe('contact');
    if (parsed.kind !== 'contact') return;
    expect(parsed.name).toBe('José García, Jr.');
    const byLabel = (label: string) => parsed.fields.find((f) => f.label === label)?.value;
    expect(byLabel('fieldCompany')).toBe('Acme; S.L.');
    expect(byLabel('fieldJobTitle')).toBe('Director');
    expect(byLabel('fieldPhone')).toBe('+34600112233');
    expect(byLabel('fieldEmail')).toBe('jose@example.com');
    expect(byLabel('fieldWeb')).toBe('https://acme.example/');
  });

  // El «;» se escapa como «\;» y el lector separa los componentes de ADR antes de desescapar.
  it('dirección con punto y coma: vuelve idéntica', () => {
    const address = 'C/ Mayor, 1; 2ºB';
    const text = buildOk({ kind: 'contact', ...base, firstName: 'Ana', address });
    const parsed = parseContent(text);
    if (parsed.kind !== 'contact') throw new Error('se esperaba contact');
    const value = parsed.fields.find((f) => f.label === 'fieldAddress')?.value;
    expect(value).toBe(address);
  });

  it('nota con salto de línea (se ve como espacio) y una barra literal seguida de "n" (se conserva)', () => {
    const note = 'Primera línea\nSegunda línea ver C:\\nuevo';
    const text = buildOk({ kind: 'contact', ...base, firstName: 'Ana', note });
    const parsed = parseContent(text);
    expect(parsed.kind).toBe('contact');
    if (parsed.kind !== 'contact') return;
    const value = parsed.fields.find((f) => f.label === 'fieldNote')?.value;
    expect(value).toBe(note.replace(/\n/g, ' '));
  });

  it('sin nombre pero con empresa: el nombre es la empresa', () => {
    const text = buildOk({ kind: 'contact', ...base, org: 'Acme S.L.' });
    const parsed = parseContent(text);
    expect(parsed).toMatchObject({ kind: 'contact', name: 'Acme S.L.' });
  });

  it('sin nombre ni empresa → required', () => {
    expectFail({ kind: 'contact', ...base }, 'required', 'firstName');
  });

  it('teléfono inválido (USSD o con letras) → invalidPhone', () => {
    expectFail({ kind: 'contact', ...base, firstName: 'Ana', phone: '*#06#' }, 'invalidPhone', 'phone');
    expectFail({ kind: 'contact', ...base, firstName: 'Ana', phone: 'abc' }, 'invalidPhone', 'phone');
  });

  it('email sin arroba → invalidEmail', () => {
    expectFail({ kind: 'contact', ...base, firstName: 'Ana', email: 'no-arroba' }, 'invalidEmail', 'email');
  });

  it('url con esquema peligroso → unsafeScheme en el campo url', () => {
    expectFail({ kind: 'contact', ...base, firstName: 'Ana', url: 'javascript:x' }, 'unsafeScheme', 'url');
  });
});

describe('buildContent: email', () => {
  it('destinatario con "+", asunto con "+" y "&", cuerpo con saltos de línea', () => {
    const to = 'ana+qr@example.com';
    const subject = '1+1 = 2 & más?';
    const body = 'Línea 1\nLínea 2';
    const text = buildOk({ kind: 'email', to, subject, body });
    const parsed = parseContent(text);
    expect(parsed.kind).toBe('email');
    if (parsed.kind !== 'email') return;
    expect(parsed.to).toBe(to);
    expect(parsed.subject).toBe(subject);
    expect(parsed.body).toBe(body.replace(/\n/g, '\r\n'));
  });

  it('sin destinatario → required; destinatario inválido → invalidEmail', () => {
    expectFail({ kind: 'email', to: '', subject: '', body: '' }, 'required', 'to');
    expectFail({ kind: 'email', to: 'no-arroba', subject: '', body: '' }, 'invalidEmail', 'to');
  });
});

describe('buildContent: tel', () => {
  it('limpia espacios y separadores', () => {
    const text = buildOk({ kind: 'tel', number: '+34 (91) 123-45-67' });
    expect(text).toBe('tel:+34911234567');
    expect(parseContent(text).kind).toBe('tel');
  });

  it('USSD → invalidPhone; vacío → required', () => {
    expectFail({ kind: 'tel', number: '*#06#' }, 'invalidPhone', 'number');
    expectFail({ kind: 'tel', number: '' }, 'required', 'number');
  });
});

describe('buildContent: sms', () => {
  it('número y cuerpo con "?", ":" y "&" se conservan idénticos', () => {
    const number = '+34600000000';
    const body = '¿Vienes? Hora: 10:30 & cena';
    const text = buildOk({ kind: 'sms', number, body });
    const parsed = parseContent(text);
    expect(parsed).toMatchObject({ kind: 'sms', number, body });
  });

  it('sin cuerpo: sin dos puntos finales', () => {
    const text = buildOk({ kind: 'sms', number: '+346000000000', body: '' });
    expect(text).toBe('SMSTO:+346000000000');
  });
});

describe('buildContent: geo', () => {
  it('latitud, longitud y texto de búsqueda', () => {
    const text = buildOk({ kind: 'geo', lat: 40.416775, lon: -3.70379, query: 'Puerta del Sol, Madrid' });
    const parsed = parseContent(text);
    expect(parsed).toMatchObject({ kind: 'geo', lat: 40.416775, lon: -3.70379, query: 'Puerta del Sol, Madrid' });
  });

  it('1e-7 no produce notación científica', () => {
    const text = buildOk({ kind: 'geo', lat: 1e-7, lon: 0, query: '' });
    const coords = text.slice('geo:'.length);
    expect(coords).not.toContain('e');
    expect(parseContent(text).kind).toBe('geo');
  });

  it('-0.0000001 no debe dar "-0"', () => {
    const text = buildOk({ kind: 'geo', lat: -0.0000001, lon: 0, query: '' });
    expect(text).not.toContain('-0');
  });

  it('coordenadas fuera de rango o no numéricas → invalidCoords', () => {
    expectFail({ kind: 'geo', lat: 91, lon: 0, query: '' }, 'invalidCoords', 'lat');
    expectFail({ kind: 'geo', lat: 0, lon: -181, query: '' }, 'invalidCoords', 'lon');
    expectFail({ kind: 'geo', lat: NaN, lon: 0, query: '' }, 'invalidCoords', 'lat');
  });
});

describe('buildContent: event', () => {
  const base = { title: '', location: '', description: '', allDay: false, start: '', end: '' };

  it('con hora: ida y vuelta de fecha/hora local, título/lugar/descripción con caracteres especiales', () => {
    const title = 'Reunión, importante; no faltar\nfila 2';
    const location = 'Sala; A, planta 1';
    const description = 'Traer: portátil, cargador\\ y agenda';
    const text = buildOk({
      kind: 'event',
      ...base,
      title,
      location,
      description,
      start: '2026-10-05T18:30',
      end: '2026-10-05T20:00',
    });
    const parsed = parseContent(text);
    expect(parsed.kind).toBe('event');
    if (parsed.kind !== 'event') return;
    const expectedIso = new Date(2026, 9, 5, 18, 30).toISOString().replace(/\.\d{3}Z$/, 'Z');
    expect(parsed.start?.iso).toBe(expectedIso);
    expect(parsed.start?.tz).toBe('UTC');
    expect(parsed.start?.allDay).toBe(false);
    // A diferencia de vCard (donde "\n" vuelve como espacio), en iCalendar el salto de línea se recupera igual.
    expect(parsed.title).toBe(title);
    expect(parsed.location).toBe(location);
    expect(parsed.description).toBe(description);
  });

  it('día completo de un solo día: sin DTEND', () => {
    const text1 = buildOk({ kind: 'event', ...base, title: 'Fiesta', allDay: true, start: '2026-12-24', end: '' });
    const text2 = buildOk({ kind: 'event', ...base, title: 'Fiesta', allDay: true, start: '2026-12-24', end: '2026-12-24' });
    for (const text of [text1, text2]) {
      expect(text).not.toContain('DTEND');
      const parsed = parseContent(text);
      expect(parsed.kind).toBe('event');
      if (parsed.kind !== 'event') continue;
      expect(parsed.start).toMatchObject({ iso: '2026-12-24', allDay: true });
      expect(parsed.end).toBeUndefined();
    }
  });

  it('varios días: DTEND es el día siguiente al último (RFC 5545)', () => {
    const text = buildOk({ kind: 'event', ...base, title: 'Puente', allDay: true, start: '2026-12-24', end: '2026-12-26' });
    expect(text).toContain('DTEND;VALUE=DATE:20261227');
    const parsed = parseContent(text);
    expect(parsed.kind).toBe('event');
    if (parsed.kind !== 'event') return;
    expect(parsed.end).toMatchObject({ iso: '2026-12-27', allDay: true });
  });

  it('fin antes del inicio → endBeforeStart', () => {
    expectFail({ kind: 'event', ...base, title: 'X', start: '2026-10-05T20:00', end: '2026-10-05T18:00' }, 'endBeforeStart', 'end');
    expectFail({ kind: 'event', ...base, title: 'X', allDay: true, start: '2026-12-26', end: '2026-12-24' }, 'endBeforeStart', 'end');
  });

  it('fecha inexistente (31 de abril) → invalidDate', () => {
    expectFail({ kind: 'event', ...base, title: 'X', allDay: true, start: '2026-04-31', end: '' }, 'invalidDate', 'start');
  });

  it('sin título → required', () => {
    expectFail({ kind: 'event', ...base, start: '2026-10-05T18:00' }, 'required', 'title');
  });
});

describe('buildContent: sepa', () => {
  const base = { name: '', iban: '', bic: '', amount: '', reference: '' };

  it('IBAN con espacios y en minúsculas, BIC, nombre e importe con coma decimal', () => {
    const text = buildOk({
      kind: 'sepa',
      ...base,
      name: 'Taller Pérez SL',
      iban: 'es91 2100 0418 4502 0005 1332',
      bic: 'CAIXESBBXXX',
      amount: '12,5',
    });
    const parsed = parseContent(text);
    expect(parsed.kind).toBe('sepa');
    if (parsed.kind !== 'sepa') return;
    expect(parsed.amount).toBe('12.50');
    expect(parsed.iban).toBe('ES9121000418450200051332');
    expect(parsed.ibanValid).toBe(true);
    expect(parsed.bic).toBe('CAIXESBBXXX');
    expect(parsed.name).toBe('Taller Pérez SL');
  });

  it('IBAN también válido en mayúsculas sin espacios', () => {
    const text = buildOk({ kind: 'sepa', ...base, name: 'X', iban: 'ES9121000418450200051332' });
    expect(parseContent(text)).toMatchObject({ iban: 'ES9121000418450200051332', ibanValid: true });
  });

  it('importe 0 o con decimales de más → invalidAmount', () => {
    expectFail({ kind: 'sepa', ...base, name: 'X', iban: 'ES9121000418450200051332', amount: '0' }, 'invalidAmount', 'amount');
    expectFail({ kind: 'sepa', ...base, name: 'X', iban: 'ES9121000418450200051332', amount: '0,00' }, 'invalidAmount', 'amount');
    expectFail({ kind: 'sepa', ...base, name: 'X', iban: 'ES9121000418450200051332', amount: '1.234' }, 'invalidAmount', 'amount');
  });

  it('importe grande (999999999.99) es válido', () => {
    const text = buildOk({ kind: 'sepa', ...base, name: 'X', iban: 'ES9121000418450200051332', amount: '999999999.99' });
    expect(parseContent(text)).toMatchObject({ amount: '999999999.99' });
  });

  it('referencia estructurada ISO 11649 en la línea 9, sin línea 10', () => {
    const text = buildOk({ kind: 'sepa', ...base, name: 'X', iban: 'ES9121000418450200051332', reference: 'RF18 5390 0754 7034' });
    const lines = text.split('\n');
    expect(lines[9]).toBe('RF18539007547034');
    expect(lines[10]).toBeUndefined();
    expect(parseContent(text)).toMatchObject({ reference: 'RF18539007547034' });
  });

  it('referencia libre de 141 caracteres → tooLong', () => {
    expectFail({ kind: 'sepa', ...base, name: 'X', iban: 'ES9121000418450200051332', reference: 'A'.repeat(141) }, 'tooLong', 'reference');
  });

  it('IBAN inválido → invalidIban; BIC corto → invalidBic', () => {
    expectFail({ kind: 'sepa', ...base, name: 'X', iban: 'ES00 0000 0000 0000 0000 0000' }, 'invalidIban', 'iban');
    expectFail({ kind: 'sepa', ...base, name: 'X', iban: 'ES9121000418450200051332', bic: 'XX' }, 'invalidBic', 'bic');
  });

  it('nombre con salto de línea se convierte en espacio, sin romper las líneas siguientes', () => {
    const text = buildOk({ kind: 'sepa', ...base, name: 'Línea 1\nLínea 2', iban: 'ES9121000418450200051332' });
    const lines = text.split('\n');
    expect(lines[5]).toBe('Línea 1 Línea 2');
    expect(lines[6]).toBe('ES9121000418450200051332');
  });

  it('sin importe ni referencia, el texto no acaba en líneas vacías', () => {
    const text = buildOk({ kind: 'sepa', ...base, name: 'X', iban: 'ES9121000418450200051332' });
    expect(text.endsWith('\n')).toBe(false);
  });
});
