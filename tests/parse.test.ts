import { describe, expect, it } from 'vitest';
import { expandUpcE, interpretAddOn, isValidIban, parseCode, parseContent } from '@/lib/parse';

describe('parseContent', () => {
  it('reconoce URLs y dominios con www', () => {
    expect(parseContent('https://labelic.com/precios')).toEqual({ kind: 'url', url: 'https://labelic.com/precios' });
    expect(parseContent('www.labelic.com')).toEqual({ kind: 'url', url: 'https://www.labelic.com' });
  });

  it('trata esquemas peligrosos como URL para que pasen por el análisis', () => {
    expect(parseContent('javascript:alert(1)').kind).toBe('url');
  });

  it('no confunde texto con dos puntos con una URL', () => {
    expect(parseContent('Nota: comprar leche').kind).toBe('text');
  });

  it('«X:valor» con un esquema desconocido es texto (números de serie, lotes...)', () => {
    expect(parseContent('SN:ABC123').kind).toBe('text');
    expect(parseContent('Lote:42').kind).toBe('text');
    // Esquemas que abren otras aplicaciones sí pasan por el análisis de enlaces.
    // (otpauth sin «secret» no se puede mostrar como OTP, así que también pasa por ahí.)
    expect(parseContent('otpauth://totp/Ejemplo').kind).toBe('url');
    expect(parseContent('intent://scan/#Intent;scheme=zxing;end').kind).toBe('url');
  });

  it('en mailto y SMS el «+» es literal (RFC 6068), no un espacio', () => {
    expect(parseContent('mailto:a@b.es?subject=1+1%3D2')).toMatchObject({ subject: '1+1=2' });
    expect(parseContent('sms:600000000?body=A+B')).toMatchObject({ body: 'A+B' });
  });

  it('lee WiFi con escapes', () => {
    expect(parseContent('WIFI:T:WPA;S:Casa\\;Pepe;P:abc\\:123;H:true;;')).toEqual({
      kind: 'wifi',
      ssid: 'Casa;Pepe',
      password: 'abc:123',
      security: 'WPA',
      hidden: true,
    });
    expect(parseContent('WIFI:S:Libre;;')).toMatchObject({ ssid: 'Libre', security: 'nopass', password: '' });
  });

  it('lee vCard con líneas plegadas y MECARD', () => {
    const vcard = 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Coroso;Ramón\r\nFN:Ramón Coroso\r\nTEL;TYPE=CELL:+34 600 000 000\r\nEMAIL:ramon@\r\n example.com\r\nEND:VCARD';
    const p = parseContent(vcard);
    expect(p).toMatchObject({ kind: 'contact', name: 'Ramón Coroso' });
    expect(p.kind === 'contact' && p.fields).toContainEqual({ label: 'fieldEmail', value: 'ramon@example.com' });

    expect(parseContent('MECARD:N:Coroso,Ramón;TEL:600000000;;')).toMatchObject({
      kind: 'contact',
      name: 'Ramón Coroso',
      fields: [{ label: 'fieldPhone', value: '600000000' }],
    });
  });

  it('lee email, teléfono, SMS y geo', () => {
    expect(parseContent('mailto:hola@labelic.com?subject=Hola%20mundo')).toEqual({ kind: 'email', to: 'hola@labelic.com', subject: 'Hola mundo', body: '' });
    expect(parseContent('MATMSG:TO:a@b.es;SUB:Asunto;BODY:Texto;;')).toEqual({ kind: 'email', to: 'a@b.es', subject: 'Asunto', body: 'Texto' });
    expect(parseContent('tel:+34600000000')).toEqual({ kind: 'tel', number: '+34600000000' });
    expect(parseContent('SMSTO:600000000:Hola')).toEqual({ kind: 'sms', number: '600000000', body: 'Hola' });
    expect(parseContent('geo:40.4168,-3.7038?q=Sol')).toEqual({ kind: 'geo', lat: 40.4168, lon: -3.7038, query: 'Sol' });
    expect(parseContent('geo:200,0').kind).toBe('text');
  });

  it('lee un QR de pago SEPA (EPC069-12)', () => {
    const epc = ['BCD', '002', '1', 'SCT', 'BSCHESMM', 'Taller Pérez SL', 'ES91 2100 0418 4502 0005 1332', 'EUR12.50', '', '', 'Factura 2026-17'].join('\n');
    expect(parseContent(epc)).toEqual({
      kind: 'sepa',
      bic: 'BSCHESMM',
      name: 'Taller Pérez SL',
      iban: 'ES9121000418450200051332',
      ibanValid: true,
      amount: '12.50',
      reference: 'Factura 2026-17',
    });
  });

  it('SEPA: el IBAN descarta invisibles y controles bidi, y se valida con módulo 97', () => {
    const epc = (iban: string) => ['BCD', '002', '1', 'SCT', '', 'X', iban, 'EUR1', '', '', ''].join('\n');
    // U+202E (RLO) invertiría cómo se ve el IBAN; no debe llegar al valor ni a lo que se copia.
    expect(parseContent(epc('ES91\u202E2100041845020005\u202C1332'))).toMatchObject({ iban: 'ES9121000418450200051332', ibanValid: true });
    expect(parseContent(epc('ES9121000418450200051333'))).toMatchObject({ ibanValid: false });
  });
});

describe('parseContent: eventos (VEVENT/VCALENDAR)', () => {
  it('fecha completa (VALUE=DATE): evento de todo el día', () => {
    const vevent = [
      'BEGIN:VEVENT',
      'SUMMARY:Cumpleaños',
      'DTSTART;VALUE=DATE:20261003',
      'DTEND;VALUE=DATE:20261004',
      'END:VEVENT',
    ].join('\r\n');
    const p = parseContent(vevent);
    expect(p).toMatchObject({
      kind: 'event',
      title: 'Cumpleaños',
      start: { iso: '2026-10-03', allDay: true, tz: '' },
      end: { iso: '2026-10-04', allDay: true, tz: '' },
    });
  });

  it('fecha UTC ("Z")', () => {
    const vevent = 'BEGIN:VEVENT\r\nSUMMARY:Reunión\r\nDTSTART:20261003T100000Z\r\nEND:VEVENT';
    const p = parseContent(vevent);
    expect(p).toMatchObject({ kind: 'event', start: { iso: '2026-10-03T10:00:00Z', allDay: false, tz: 'UTC' } });
  });

  it('fecha con TZID', () => {
    const vevent = 'BEGIN:VEVENT\r\nSUMMARY:Reunión\r\nDTSTART;TZID=Europe/Madrid:20261003T100000\r\nEND:VEVENT';
    const p = parseContent(vevent);
    expect(p).toMatchObject({ kind: 'event', start: { iso: '2026-10-03T10:00:00', allDay: false, tz: 'Europe/Madrid' } });
  });

  it('fecha flotante (sin zona)', () => {
    const vevent = 'BEGIN:VEVENT\r\nSUMMARY:Reunión\r\nDTSTART:20261003T100000\r\nEND:VEVENT';
    const p = parseContent(vevent);
    expect(p).toMatchObject({ kind: 'event', start: { iso: '2026-10-03T10:00:00', allDay: false, tz: '' } });
  });

  it('fecha inválida → undefined', () => {
    const vevent = 'BEGIN:VEVENT\r\nSUMMARY:Reunión\r\nDTSTART:20261332T100000\r\nEND:VEVENT';
    const p = parseContent(vevent);
    expect(p).toMatchObject({ kind: 'event', start: undefined });
  });

  it('despliega líneas plegadas (RFC 5545) y desescapa DESCRIPTION', () => {
    const vevent = [
      'BEGIN:VEVENT',
      'SUMMARY:Reunión larga que se pl',
      ' iega en varias líneas',
      'DESCRIPTION:Línea 1\\nLínea 2\\, con coma\\; y punto y coma\\\\ fin',
      'LOCATION:Sala A',
      'DTSTART:20261003T100000Z',
      'END:VEVENT',
    ].join('\r\n');
    const p = parseContent(vevent);
    expect(p).toMatchObject({
      kind: 'event',
      title: 'Reunión larga que se pliega en varias líneas',
      description: 'Línea 1\nLínea 2, con coma; y punto y coma\\ fin',
      location: 'Sala A',
    });
  });

  it('BEGIN:VCALENDAR con VEVENT: el .ics es el texto original', () => {
    const vcal = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nSUMMARY:Evento\r\nDTSTART:20261003T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR';
    const p = parseContent(vcal);
    expect(p).toMatchObject({ kind: 'event', title: 'Evento', ics: vcal });
  });

  it('VCALENDAR sin ningún VEVENT cae a texto', () => {
    const vcal = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR';
    expect(parseContent(vcal).kind).toBe('text');
  });

  it('VEVENT suelto (sin VCALENDAR, con LF): el .ics se envuelve en VCALENDAR con CRLF', () => {
    const vevent = 'BEGIN:VEVENT\nSUMMARY:Evento\nDTSTART:20261003T100000Z\nEND:VEVENT';
    const p = parseContent(vevent);
    expect(p.kind).toBe('event');
    expect(p.kind === 'event' && p.ics).toBe(
      'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Mirilla//ES\r\nBEGIN:VEVENT\r\nSUMMARY:Evento\r\nDTSTART:20261003T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR',
    );
  });
});

describe('parseContent: OTP (otpauth://)', () => {
  it('TOTP con el emisor en la etiqueta', () => {
    const p = parseContent('otpauth://totp/Labelic:ramon@labelic.com?secret=JBSWY3DPEHPK3PXP&issuer=Labelic');
    expect(p).toEqual({
      kind: 'otp',
      type: 'totp',
      issuer: 'Labelic',
      account: 'ramon@labelic.com',
      secret: 'JBSWY3DPEHPK3PXP',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      counter: undefined,
    });
  });

  it('el parámetro issuer tiene prioridad sobre el de la etiqueta', () => {
    const p = parseContent('otpauth://totp/Otro:cuenta?secret=ABC&issuer=ElDeVerdad');
    expect(p).toMatchObject({ kind: 'otp', issuer: 'ElDeVerdad', account: 'cuenta' });
  });

  it('sin emisor en la etiqueta, solo la cuenta', () => {
    const p = parseContent('otpauth://totp/soloCuenta?secret=ABC');
    expect(p).toMatchObject({ kind: 'otp', issuer: '', account: 'soloCuenta' });
  });

  it('HOTP con contador', () => {
    const p = parseContent('otpauth://hotp/Ejemplo:cuenta?secret=ABC&counter=5&digits=8&period=60&algorithm=SHA256');
    expect(p).toMatchObject({ kind: 'otp', type: 'hotp', digits: 8, period: 60, algorithm: 'SHA256', counter: 5 });
  });

  it('sin «secret» no es un OTP (pasa como URL)', () => {
    expect(parseContent('otpauth://totp/Sin:secreto').kind).toBe('url');
  });
});

describe('parseContent: criptomonedas', () => {
  it('bitcoin: con importe, etiqueta y mensaje (BIP 21)', () => {
    const p = parseContent('bitcoin:1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2?amount=0.001&label=Tienda&message=Pedido%2042');
    expect(p).toEqual({
      kind: 'crypto',
      coin: 'bitcoin',
      address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
      addressValid: true,
      amount: '0.001',
      label: 'Tienda',
      message: 'Pedido 42',
    });
  });

  it('bitcoin: con checksum incorrecto → addressValid false', () => {
    const p = parseContent('bitcoin:1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN3');
    expect(p).toMatchObject({ kind: 'crypto', coin: 'bitcoin', addressValid: false });
  });

  it('bitcoin: con Bech32 en mayúsculas (frecuente en QR) se acepta', () => {
    const p = parseContent('bitcoin:BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4');
    expect(p).toMatchObject({ kind: 'crypto', coin: 'bitcoin', addressValid: true });
  });

  it('bitcoin: con parámetro lightning= sigue siendo bitcoin', () => {
    const p = parseContent('bitcoin:1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2?lightning=lnbc1pvjluezsp5');
    expect(p).toMatchObject({ kind: 'crypto', coin: 'bitcoin' });
  });

  it('lightning: no decodifica la factura, addressValid null', () => {
    const p = parseContent('lightning:lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygs');
    expect(p).toEqual({
      kind: 'crypto',
      coin: 'lightning',
      address: 'lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygs',
      addressValid: null,
      amount: '',
      label: '',
      message: '',
    });
  });

  it('ethereum: con chainId y value (EIP-681)', () => {
    const p = parseContent('ethereum:0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed@1?value=1000000000000000000');
    expect(p).toEqual({
      kind: 'crypto',
      coin: 'ethereum',
      address: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
      addressValid: true,
      amount: '1000000000000000000',
      label: '',
      message: '',
    });
  });

  it('ethereum: con dirección mal formada → addressValid false (pero se reconoce como crypto)', () => {
    const p = parseContent('ethereum:0x123@1?value=1');
    expect(p).toMatchObject({ kind: 'crypto', coin: 'ethereum', address: '0x123', addressValid: false });
  });
});

describe('parseCode', () => {
  it('un UPC-E se expande a su UPC-A de 12 dígitos', () => {
    expect(parseCode({ text: '04252614', format: 'UPC-E', gs1: false })).toEqual({ kind: 'product', gtin: '042100005264' });
    expect(expandUpcE('01234565')).toBe('012345000065');
    expect(expandUpcE('24252614')).toBeNull(); // el sistema numérico solo puede ser 0 o 1
  });

    it('un EAN-13 es un producto', () => {
    expect(parseCode({ text: '8412345678905', format: 'EAN-13', gs1: false })).toEqual({ kind: 'product', gtin: '8412345678905' });
  });

  it('el añadido EAN-2/EAN-5 del código pasa al resultado del producto', () => {
    expect(parseCode({ text: '9781234567897', format: 'EAN-13', gs1: false, addOn: '51234' })).toEqual({
      kind: 'product',
      gtin: '9781234567897',
      addOn: '51234',
    });
  });
});

describe('interpretAddOn', () => {
  it('EAN-5 que empieza por 5 en un libro (Bookland): precio en USD', () => {
    expect(interpretAddOn('9781234567897', '51234')).toEqual({ type: 'price', currency: 'USD', amount: 12.34 });
  });

  it('EAN-5 que empieza por 0 en un libro (Bookland): precio en GBP', () => {
    expect(interpretAddOn('9781234567897', '01234')).toEqual({ type: 'price', currency: 'GBP', amount: 12.34 });
  });

  it('EAN-5 interno (90000-98999): sin precio que mostrar', () => {
    expect(interpretAddOn('9781234567897', '90000')).toBeNull();
    expect(interpretAddOn('9781234567897', '98999')).toBeNull();
  });

  it('EAN-5 fuera de un GTIN Bookland (no empieza por 978/979): sin interpretación', () => {
    expect(interpretAddOn('8412345678905', '51234')).toBeNull();
  });

  it('EAN-2: número de ejemplar, con cualquier GTIN', () => {
    expect(interpretAddOn('9781234567897', '12')).toEqual({ type: 'issue', n: 12 });
    expect(interpretAddOn('8412345678905', '07')).toEqual({ type: 'issue', n: 7 });
  });

  it('longitudes que no son ni 2 ni 5 dígitos: sin interpretación', () => {
    expect(interpretAddOn('9781234567897', '123')).toBeNull();
    expect(interpretAddOn('9781234567897', '1')).toBeNull();
    expect(interpretAddOn('9781234567897', '')).toBeNull();
  });

  it('un código marcado como GS1 se interpreta desde los datos en bruto', () => {
    const p = parseCode({ text: '(01)08412345678905(10)L1', format: 'Data Matrix', gs1: true, raw: '0108412345678905' + '10L1' });
    expect(p.kind).toBe('gs1');
    expect(p.kind === 'gs1' && p.elements.map((e) => e.ai)).toEqual(['01', '10']);
  });

  it('si los datos GS1 no se entienden, se muestra como texto', () => {
    expect(parseCode({ text: 'xyz', format: 'Code 128', gs1: true, raw: 'xyz' }).kind).toBe('text');
  });

  it('un QR con GS1 Digital Link es una URL con datos GS1', () => {
    const p = parseCode({ text: 'https://id.gs1.org/01/09506000134352/10/ABC', format: 'QR', gs1: false });
    expect(p).toMatchObject({ kind: 'url', url: 'https://id.gs1.org/01/09506000134352/10/ABC' });
    expect(p.kind === 'url' && p.gs1?.map((e) => e.ai)).toEqual(['01', '10']);
  });

  it('una URL normal no lleva datos GS1', () => {
    expect(parseCode({ text: 'https://example.com/', format: 'QR', gs1: false })).toEqual({ kind: 'url', url: 'https://example.com/' });
  });
});

describe('isValidIban', () => {
  it('valida IBAN reales y rechaza los alterados', () => {
    expect(isValidIban('ES9121000418450200051332')).toBe(true);
    expect(isValidIban('DE89370400440532013000')).toBe(true);
    expect(isValidIban('GB82WEST12345698765432')).toBe(true);
    expect(isValidIban('GB82WEST12345698765433')).toBe(false);
    expect(isValidIban('ES91')).toBe(false);
  });
});

describe('vCard: componentes escapados', () => {
  it('una barra escapada antes de «;» no escapa el separador', () => {
    const p = parseContent('BEGIN:VCARD\nVERSION:3.0\nFN:Ana\nADR:;;Calle\\\\;Madrid;;;;\nEND:VCARD');
    expect(p.kind === 'contact' && p.fields[0]?.value).toBe('Calle\\, Madrid');
  });
});
