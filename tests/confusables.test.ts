import { describe, expect, it } from 'vitest';
import { skeleton } from '@/lib/data/confusables';

describe('confusables: skeleton UTS #39 simplificado', () => {
  it('reduce homoglifos cirílicos a su ASCII equivalente', () => {
    // "аррӏе" con homoglifos cirílicos de "apple": а(U+0430) р(U+0440) р(U+0440) ӏ(U+04CF) е(U+0435)
    expect(skeleton('аррӏe')).toBe('apple');
  });

  it('detecta "pаypal" con una «а» cirílica', () => {
    expect(skeleton('pаypal')).toBe('paypal');
  });

  it('letra griega ómicron (ο, U+03BF) se confunde con "o"', () => {
    expect(skeleton('ο')).toBe('o');
  });

  it('"ɡ" de gancho (U+0261) se confunde con "g" → "google"', () => {
    expect(skeleton('ɡoogle')).toBe('google');
  });

  it('"ӏ" cirílica (U+04CF, "palochka") se confunde con "l"', () => {
    expect(skeleton('ӏ')).toBe('l');
  });

  it('el texto ASCII puro no se toca (salvo pasar a minúsculas)', () => {
    expect(skeleton('hello123')).toBe('hello123');
    expect(skeleton('Test-123')).toBe('test-123');
    expect(skeleton('example.com')).toBe('example.com');
  });

  it('"españa": la tilde combinante no está en la tabla reducida, así que NFD+NFC la recompone en "ñ"', () => {
    expect(skeleton('españa')).toBe('españa');
  });
});
