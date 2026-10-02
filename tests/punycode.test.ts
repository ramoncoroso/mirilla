import { domainToUnicode } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hostToUnicode } from '@/lib/punycode';

describe('punycode: decodificación de etiquetas xn--', () => {
  it('decodifica casos conocidos', () => {
    expect(hostToUnicode('xn--pple-43d.com')).toBe('аpple.com'); // "а" cirílica + "pple"
    expect(hostToUnicode('xn--espaa-rta.es')).toBe('españa.es');
    expect(hostToUnicode('xn--mller-kva.de')).toBe('müller.de');
    expect(hostToUnicode('xn--wgv71a119e.jp')).toBe('日本語.jp');
  });

  it('decodifica varias etiquetas en el mismo host', () => {
    expect(hostToUnicode('www.xn--80ak6aa92e.com')).toBe('www.аррӏе.com');
  });

  it('acepta el prefijo en mayúsculas', () => {
    expect(hostToUnicode('XN--PPLE-43D.COM'.toLowerCase())).toBe('аpple.com');
    // El prefijo en mayúsculas puro, sin forzar minúsculas antes de llamar:
    expect(hostToUnicode('XN--espaa-rta.es')).toBe('españa.es');
  });

  it('deja etiquetas xn-- mal formadas tal cual, sin lanzar', () => {
    expect(hostToUnicode('xn--.com')).toBe('xn--.com');
    expect(hostToUnicode('xn--$$$.com')).toBe('xn--$$$.com');
    expect(hostToUnicode('xn---.com')).toBe('xn---.com'); // dígito inválido ('-' no es un dígito punycode)
    // Dígitos válidos pero que provocan desbordamiento al decodificar: tampoco debe lanzar.
    expect(hostToUnicode('xn--999999999999999999999999999999999999999999999999999999999999999999999.com')).toBe(
      'xn--999999999999999999999999999999999999999999999999999999999999999999999.com',
    );
  });

  it('no toca hosts puramente ASCII', () => {
    expect(hostToUnicode('example.com')).toBe('example.com');
    expect(hostToUnicode('sub.example.co.uk')).toBe('sub.example.co.uk');
    expect(hostToUnicode('')).toBe('');
  });

  it('propiedad: hace round-trip con una variedad de etiquetas Unicode', () => {
    const labels = [
      'café',
      'münchen',
      'español',
      'niño',
      '日本語',
      '中文',
      '한국어',
      'россия',
      'ελληνικά',
      'العربية',
      'भारत',
      'ไทย',
      'việt',
      'türkiye',
      'straße',
      'ångström',
      'gårdsäter',
      'øresund',
      'über',
      'façade',
      'naïve',
      'crème',
      'brûlée',
      'élan',
      'mañana',
      'piñata',
      'jalapeño',
      'zürich',
      'ångström2',
      'test123',
    ];

    for (const label of labels) {
      const host = new URL(`https://${label}.com`).hostname; // IDNA → punycode (ACE)
      const expected = domainToUnicode(host);
      expect(hostToUnicode(host)).toBe(expected);
    }
  });
});
