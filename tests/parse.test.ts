import { describe, expect, it } from 'vitest';
import { parseContent } from '@/lib/parse';

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
    expect(p.kind === 'contact' && p.fields).toContainEqual({ label: 'Email', value: 'ramon@example.com' });

    expect(parseContent('MECARD:N:Coroso,Ramón;TEL:600000000;;')).toMatchObject({
      kind: 'contact',
      name: 'Ramón Coroso',
      fields: [{ label: 'Teléfono', value: '600000000' }],
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
      amount: '12.50 €',
      reference: 'Factura 2026-17',
    });
  });
});
