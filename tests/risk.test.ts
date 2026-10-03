import { describe, expect, it } from 'vitest';
import type { Code } from '@/lib/decode';
import { isDangerous, overallVerdict } from '@/lib/risk';

const qr = (text: string): Code => ({ text, format: 'QRCode' }) as Code;

describe('veredicto de todo lo leído (icono de la extensión)', () => {
  it('es el peor de los códigos', () => {
    expect(overallVerdict([])).toBe('clear');
    expect(overallVerdict([qr('WIFI:T:WPA;S:Casa;P:x;;')])).toBe('clear');
    expect(overallVerdict([qr('WIFI:T:WPA;S:Casa;P:x;;'), qr('http://example.com/')])).toBe('caution');
    expect(overallVerdict([qr('http://example.com/'), qr('javascript:alert(1)')])).toBe('danger');
  });

  it('isDangerous solo con Peligro', () => {
    expect(isDangerous(qr('http://example.com/'))).toBe(false);
    expect(isDangerous(qr('https://www.paypal.com@evil.example/'))).toBe(true);
  });
});
