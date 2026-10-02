import { describe, expect, it } from 'vitest';
import { isUssd, premiumPrefix } from '@/lib/data/phone';

describe('isUssd', () => {
  it('detecta códigos USSD/MMI con * o #', () => {
    expect(isUssd('*#06#')).toBe(true);
    expect(isUssd('**21*600123456#')).toBe(true);
  });

  it('detecta el "#" codificado como %23 en un tel:', () => {
    expect(isUssd('*21*600123456%23')).toBe(true);
    expect(isUssd('600123456%23')).toBe(true);
  });

  it('un número normal no es USSD', () => {
    expect(isUssd('+34 600 123 456')).toBe(false);
    expect(isUssd('912345678')).toBe(false);
  });
});

describe('premiumPrefix', () => {
  it('España, formato nacional', () => {
    expect(premiumPrefix('806 123 456')).toBe('+34 806');
    expect(premiumPrefix('905123456')).toBe('+34 905');
    expect(premiumPrefix('118 22')).toBe('+34 118');
  });

  it('España, formato internacional con espacios', () => {
    expect(premiumPrefix('+34 806 123 456')).toBe('+34 806');
    expect(premiumPrefix('+34 807 123 456')).toBe('+34 807');
    expect(premiumPrefix('0034 806 123 456')).toBe('+34 806');
  });

  it('números normales no son de tarificación especial', () => {
    expect(premiumPrefix('+34 600 123 456')).toBeNull();
    expect(premiumPrefix('912345678')).toBeNull();
    expect(premiumPrefix('+44 20 7946 0000')).toBeNull();
  });

  it('Reino Unido, rango 09 (Ofcom)', () => {
    expect(premiumPrefix('+44 909 123 4567')).toBe('+44 09');
  });

  it('Francia, rango 08 9X (ARCEP)', () => {
    expect(premiumPrefix('+33 891 123 456')).toBe('+33 089');
  });

  it('Alemania, 0900 y 0137 (BNetzA)', () => {
    expect(premiumPrefix('+49 900 123456')).toBe('+49 0900');
    expect(premiumPrefix('+49 137 123456')).toBe('+49 0137');
  });

  it('Italia, 899 y 892 (AGCOM)', () => {
    expect(premiumPrefix('+39 899 123456')).toBe('+39 899');
  });

  it('Portugal, 760-762 (ANACOM)', () => {
    expect(premiumPrefix('+351 761 123 456')).toBe('+351 761');
  });

  it('un país sin reglas conocidas devuelve null', () => {
    expect(premiumPrefix('+1 900 123 4567')).toBeNull();
  });
});
