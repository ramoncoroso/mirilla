import { describe, expect, it } from 'vitest';
import { checkDigit, gtinPrefix, isValidGtin, parseDigitalLink, parseGs1, parseGs1Date, toHri } from '@/lib/gs1';

const simplify = (r: ReturnType<typeof parseGs1>) => r.elements.map(({ ai, value, decimals, checkDigitOk }) => ({ ai, value, decimals, checkDigitOk }));

describe('parseGs1', () => {
  it('interpreta la salida en bruto de zxing (GS tras los campos variables)', () => {
    // Texto real devuelto por zxing para (01)08412345678905(17)261200(10)LOTE42(3103)001250(21)ABC
    const r = parseGs1('01084123456789051726120010LOTE42\u001d310300125021ABC');
    expect(simplify(r)).toEqual([
      { ai: '01', value: '08412345678905', decimals: undefined, checkDigitOk: true },
      { ai: '17', value: '261200', decimals: undefined, checkDigitOk: undefined },
      { ai: '10', value: 'LOTE42', decimals: undefined, checkDigitOk: undefined },
      { ai: '3103', value: '001250', decimals: 3, checkDigitOk: undefined },
      { ai: '21', value: 'ABC', decimals: undefined, checkDigitOk: undefined },
    ]);
    expect(r.rest).toBeUndefined();
    expect(toHri(r.elements)).toBe('(01)08412345678905(17)261200(10)LOTE42(3103)001250(21)ABC');
  });

  it('los AIs de longitud predefinida no necesitan separador', () => {
    const r = parseGs1('0109506000134352172612313103001250' + '10ABC');
    expect(r.elements.map((e) => e.ai)).toEqual(['01', '17', '3103', '10']);
    expect(r.elements.at(-1)?.value).toBe('ABC');
  });

  it('quita el identificador de simbología y el FNC1 inicial', () => {
    expect(parseGs1(']d2\u001d0109506000134352').elements[0]?.value).toBe('09506000134352');
  });

  it('detecta un dígito de control incorrecto y da el correcto', () => {
    const [e] = parseGs1('0108412345678906').elements;
    expect(e).toMatchObject({ checkDigitOk: false, expectedCheckDigit: '5' });
  });

  it('valida SSCC y GLN', () => {
    expect(parseGs1('00106141411234567897').elements[0]?.checkDigitOk).toBe(true);
    expect(parseGs1('4149506000134352').elements[0]).toMatchObject({ ai: '414', checkDigitOk: true });
  });

  it('se detiene en un AI desconocido y devuelve el resto', () => {
    const r = parseGs1('0109506000134352' + '89XYZ');
    expect(r.elements).toHaveLength(1);
    expect(r.rest).toBe('89XYZ');
  });
});

describe('dígito de control', () => {
  it('calcula el de GTIN conocidos', () => {
    expect(checkDigit('0950600013435')).toBe('2');
    expect(checkDigit('841234567890')).toBe('5');
    expect(isValidGtin('09506000134352')).toBe(true);
    expect(isValidGtin('9506000134352')).toBe(true);
    expect(isValidGtin('9506000134353')).toBe(false);
    expect(isValidGtin('12345')).toBe(false);
  });
});

describe('parseGs1Date', () => {
  const now = new Date(2026, 8, 27);
  const ymd = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate()];

  it('fecha normal y fin de mes (DD = 00)', () => {
    expect(ymd(parseGs1Date('261231', now)!.date)).toEqual([2026, 12, 31]);
    expect(parseGs1Date('260200', now)).toMatchObject({ endOfMonth: true });
    expect(ymd(parseGs1Date('260200', now)!.date)).toEqual([2026, 2, 28]);
  });

  it('ventana deslizante de siglo', () => {
    expect(parseGs1Date('991231', now)!.date.getFullYear()).toBe(1999);
    expect(parseGs1Date('750101', now)!.date.getFullYear()).toBe(2075);
  });

  it('rechaza fechas imposibles', () => {
    expect(parseGs1Date('260230', now)).toBeNull();
    expect(parseGs1Date('261301', now)).toBeNull();
    expect(parseGs1Date('2612', now)).toBeNull();
  });
});

describe('parseDigitalLink', () => {
  it('lee AIs de la ruta y de la query', () => {
    const els = parseDigitalLink('https://id.gs1.org/01/09506000134352/10/ABC123?17=261231&3103=000250');
    expect(els?.map((e) => [e.ai, e.value])).toEqual([
      ['01', '09506000134352'],
      ['10', 'ABC123'],
      ['17', '261231'],
      ['3103', '000250'],
    ]);
    expect(els?.[3]?.decimals).toBe(3);
    expect(els?.[0]?.checkDigitOk).toBe(true);
  });

  it('admite un prefijo de ruta propio y normaliza GTIN-13 a 14 dígitos', () => {
    const els = parseDigitalLink('https://marca.example/productos/01/9506000134352/21/XYZ%2F1');
    expect(els?.map((e) => [e.ai, e.value])).toEqual([
      ['01', '09506000134352'],
      ['21', 'XYZ/1'],
    ]);
  });

  it('no confunde URLs normales con Digital Link', () => {
    expect(parseDigitalLink('https://example.com/blog/2026/01/post')).toBeNull();
    expect(parseDigitalLink('https://example.com/01/no-es-gtin')).toBeNull();
    expect(parseDigitalLink('ftp://id.gs1.org/01/09506000134352')).toBeNull();
  });
});

describe('gtinPrefix', () => {
  it('país del organismo GS1 que asignó el número', () => {
    expect(gtinPrefix('8412345678905')).toEqual({ regions: ['ES', 'AD'] });
    expect(gtinPrefix('4006381333931')).toEqual({ regions: ['DE'] });
    expect(gtinPrefix('036000291452')).toEqual({ regions: ['US', 'CA'] }); // UPC-A
    expect(gtinPrefix('18412345678902')).toEqual({ regions: ['ES', 'AD'] }); // GTIN-14 con indicador
  });

  it('casos especiales', () => {
    expect(gtinPrefix('9788420412146')).toEqual({ special: 'prefixIsbn' });
    expect(gtinPrefix('9790060115615')).toEqual({ special: 'prefixIsmn' });
    expect(gtinPrefix('9771234567003')).toEqual({ special: 'prefixIssn' });
    expect(gtinPrefix('2012345678909')).toEqual({ special: 'prefixRestricted' });
    expect(gtinPrefix('96385074')).toBeNull(); // GTIN-8
  });
});
