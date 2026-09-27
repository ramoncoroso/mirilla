import { describe, expect, it } from 'vitest';
import { expandUpcE, isValidIban, parseCode, parseContent } from '@/lib/parse';

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
    expect(parseContent('otpauth://totp/Ejemplo?secret=ABC').kind).toBe('url');
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

describe('parseCode', () => {
  it('un UPC-E se expande a su UPC-A de 12 dígitos', () => {
    expect(parseCode({ text: '04252614', format: 'UPC-E', gs1: false })).toEqual({ kind: 'product', gtin: '042100005264' });
    expect(expandUpcE('01234565')).toBe('012345000065');
    expect(expandUpcE('24252614')).toBeNull(); // el sistema numérico solo puede ser 0 o 1
  });

    it('un EAN-13 es un producto', () => {
    expect(parseCode({ text: '8412345678905', format: 'EAN-13', gs1: false })).toEqual({ kind: 'product', gtin: '8412345678905' });
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
