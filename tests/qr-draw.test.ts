// Dibujo del QR (4.4): lógica pura de lib/qr-draw.ts, y una comprobación de verdad con zxing-wasm en Node
// (sin navegador): se codifica con el escritor real, se dibuja con rasterize y se vuelve a leer con el lector real.

import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildContent, type BuildInput } from '@/lib/build';
import { parseContent } from '@/lib/parse';
import {
  checkColors,
  contrastRatio,
  darkRuns,
  DEFAULT_LOGO_RATIO,
  logoBox,
  logoHole,
  luminance,
  matrixFromSymbol,
  MAX_LOGO_RATIO,
  parseHex,
  pixelSize,
  rasterize,
  type QrMatrix,
} from '@/lib/qr-draw';

// --- Lógica pura -----------------------------------------------------------------------------

describe('matrixFromSymbol', () => {
  it('convierte un símbolo (0 = oscuro) en una matriz de 0/1', () => {
    // 3x3: una cruz oscura sobre fondo claro.
    const symbol = { width: 3, height: 3, data: [255, 0, 255, 0, 0, 0, 255, 0, 255] };
    const m = matrixFromSymbol(symbol);
    expect(m.size).toBe(3);
    expect(Array.from(m.dark)).toEqual([0, 1, 0, 1, 1, 1, 0, 1, 0]);
  });

  it('lanza si el símbolo no es cuadrado', () => {
    expect(() => matrixFromSymbol({ width: 3, height: 2, data: [0, 0, 0, 0, 0, 0] })).toThrow();
  });
});

describe('logoHole', () => {
  it('cuenta impar y centrado', () => {
    const hole = logoHole(21, 0.22);
    expect(hole).not.toBeNull();
    if (!hole) return;
    expect(hole.count % 2).toBe(1);
    expect(hole.start * 2 + hole.count).toBe(21);
  });

  it('ratio 0 → sin hueco', () => {
    expect(logoHole(21, 0)).toBeNull();
  });

  it('un ratio por encima de MAX_LOGO_RATIO se limita a él', () => {
    expect(logoHole(21, 0.9)).toEqual(logoHole(21, MAX_LOGO_RATIO));
  });

  it('tamaños pequeños con poco ratio dan null (count < 3)', () => {
    expect(logoHole(9, 0.2)).toBeNull();
  });
});

describe('darkRuns', () => {
  it('no incluye módulos del hueco, y la suma de largos es el número de módulos oscuros fuera de él', () => {
    const size = 15;
    const dark = new Uint8Array(size * size);
    // Patrón de damero: módulo oscuro si (x+y) es par.
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) dark[y * size + x] = (x + y) % 2 === 0 ? 1 : 0;
    const m: QrMatrix = { size, dark };
    const hole = logoHole(size, 0.3);
    expect(hole).not.toBeNull();
    if (!hole) return;

    const runs = darkRuns(m, hole);
    let totalLen = 0;
    let darkOutsideHole = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const inHole = x >= hole.start && x < hole.start + hole.count && y >= hole.start && y < hole.start + hole.count;
        if (dark[y * size + x] && !inHole) darkOutsideHole++;
      }
    }
    for (const [x, y, len] of runs) {
      totalLen += len;
      for (let i = 0; i < len; i++) {
        const inHole = x + i >= hole.start && x + i < hole.start + hole.count && y >= hole.start && y < hole.start + hole.count;
        expect(inHole).toBe(false);
      }
    }
    expect(totalLen).toBe(darkOutsideHole);
  });

  it('sin hueco, incluye todos los módulos oscuros', () => {
    const m: QrMatrix = { size: 3, dark: new Uint8Array([1, 1, 0, 0, 1, 0, 1, 0, 1]) };
    const runs = darkRuns(m, null);
    const totalLen = runs.reduce((acc, [, , len]) => acc + len, 0);
    const darkCount = Array.from(m.dark).filter(Boolean).length;
    expect(totalLen).toBe(darkCount);
  });
});

describe('checkColors y contraste', () => {
  it('negro sobre blanco: ok, con contraste máximo (≈21)', () => {
    expect(checkColors('#000000', '#ffffff')).toBe('ok');
    const ratio = contrastRatio(parseHex('#000000')!, parseHex('#ffffff')!);
    expect(ratio).toBeCloseTo(21, 0);
  });

  it('blanco sobre negro: inverted', () => {
    expect(checkColors('#ffffff', '#000000')).toBe('inverted');
  });

  it('grises con el oscuro más claro que el fondo: contraste bajo, no inverted', () => {
    expect(checkColors('#777777', '#888888')).toBe('lowContrast');
  });

  it('caso claro de lowContrast: gris medio sobre blanco', () => {
    expect(checkColors('#999999', '#ffffff')).toBe('lowContrast');
  });

  it('colores no reconocidos → invalid', () => {
    expect(checkColors('#00f', 'red')).toBe('invalid');
  });

  it('luminance: negro 0, blanco 1', () => {
    expect(luminance(parseHex('#000000')!)).toBe(0);
    expect(luminance(parseHex('#ffffff')!)).toBe(1);
  });
});

describe('rasterize', () => {
  const m: QrMatrix = { size: 3, dark: new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0, 0]) };
  const o = { scale: 2, margin: 1, fg: '#000000', bg: '#ffffff' };

  it('tamaño (size+2*margin)*scale', () => {
    const r = rasterize(m, o);
    const expected = pixelSize(m, o);
    expect(r.width).toBe(expected);
    expect(r.height).toBe(expected);
    expect(expected).toBe((3 + 2 * 1) * 2);
  });

  it('la esquina es del color de fondo', () => {
    const r = rasterize(m, o);
    expect([r.data[0], r.data[1], r.data[2], r.data[3]]).toEqual([255, 255, 255, 255]);
  });

  it('un píxel del módulo oscuro (0,0) es del color de primer plano', () => {
    const r = rasterize(m, o);
    // Módulo (0,0) oscuro: con margen 1 y escala 2, cae en los píxeles (2,2)-(3,3).
    const px = 2;
    const py = 2;
    const i = (py * r.width + px) * 4;
    expect([r.data[i], r.data[i + 1], r.data[i + 2], r.data[i + 3]]).toEqual([0, 0, 0, 255]);
  });
});

// --- Ida y vuelta real con zxing-wasm (sin navegador) -----------------------------------------

globalThis.ImageData ??= class ImageDataPolyfill {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
} as unknown as typeof ImageData;

let encodeWithWriter: typeof import('@/lib/generate').encodeWithWriter;
let QrTooLongError: typeof import('@/lib/generate').QrTooLongError;
let readBarcodes: typeof import('zxing-wasm/reader').readBarcodes;

beforeAll(async () => {
  const { prepareZXingModule: prepareWriter } = await import('zxing-wasm/writer');
  const { prepareZXingModule: prepareReader, readBarcodes: read } = await import('zxing-wasm/reader');
  await prepareWriter({ overrides: { wasmBinary: fs.readFileSync('node_modules/zxing-wasm/dist/writer/zxing_writer.wasm') }, fireImmediately: true });
  await prepareReader({ overrides: { wasmBinary: fs.readFileSync('node_modules/zxing-wasm/dist/reader/zxing_reader.wasm') }, fireImmediately: true });
  readBarcodes = read;
  ({ encodeWithWriter, QrTooLongError } = await import('@/lib/generate'));
}, 30_000);

/** Lee el primer código QR de una imagen RGBA ya rasterizada. */
async function readRgba(r: { data: Uint8ClampedArray; width: number; height: number }) {
  const [result] = await readBarcodes(new ImageData(r.data as Uint8ClampedArray<ArrayBuffer>, r.width, r.height), { formats: ['QRCode'] });
  return result;
}

describe('ida y vuelta con zxing real: los 10 tipos de contenido', () => {
  const cases: { name: string; input: BuildInput; kind: string }[] = [
    { name: 'url', input: { kind: 'url', url: 'example.com' }, kind: 'url' },
    { name: 'text', input: { kind: 'text', text: 'Nota: comprar leche' }, kind: 'text' },
    { name: 'wifi', input: { kind: 'wifi', ssid: 'Casa', password: 'password1', security: 'WPA', hidden: false }, kind: 'wifi' },
    {
      name: 'contact',
      input: { kind: 'contact', firstName: 'Ana', lastName: 'López', org: '', title: '', phone: '+34600000000', email: 'ana@example.com', url: '', address: '', note: '' },
      kind: 'contact',
    },
    { name: 'email', input: { kind: 'email', to: 'ana@example.com', subject: 'Hola', body: 'Un saludo' }, kind: 'email' },
    { name: 'tel', input: { kind: 'tel', number: '+34600000000' }, kind: 'tel' },
    { name: 'sms', input: { kind: 'sms', number: '+34600000000', body: 'Hola' }, kind: 'sms' },
    { name: 'geo', input: { kind: 'geo', lat: 40.416775, lon: -3.70379, query: 'Sol' }, kind: 'geo' },
    {
      name: 'event',
      input: { kind: 'event', title: 'Reunión', location: 'Sala A', description: 'Trimestral', allDay: false, start: '2026-10-05T18:30', end: '2026-10-05T20:00' },
      kind: 'event',
    },
    { name: 'sepa', input: { kind: 'sepa', name: 'Taller Pérez SL', iban: 'ES9121000418450200051332', bic: 'CAIXESBBXXX', amount: '12,50', reference: '' }, kind: 'sepa' },
  ];

  for (const { name, input, kind } of cases) {
    it(`${name}: se construye, codifica, dibuja y lee de vuelta igual`, async () => {
      const built = buildContent(input);
      expect(built.ok).toBe(true);
      if (!built.ok) return;
      const matrix = await encodeWithWriter(built.text, 'M');
      const raster = rasterize(matrix, { scale: 4, margin: 4, fg: '#000000', bg: '#ffffff' });
      const read = await readRgba(raster);
      expect(read?.text).toBe(built.text);
      expect(parseContent(read?.text ?? '').kind).toBe(kind);
    });
  }
});

describe('ida y vuelta real: niveles de corrección L/M/Q/H', () => {
  const text = 'https://example.com/producto/12345';
  for (const ecLevel of ['L', 'M', 'Q', 'H'] as const) {
    it(`nivel ${ecLevel} se lee y conserva su nivel`, async () => {
      const matrix = await encodeWithWriter(text, ecLevel);
      const raster = rasterize(matrix, { scale: 4, margin: 4, fg: '#000000', bg: '#ffffff' });
      const read = await readRgba(raster);
      expect(read?.text).toBe(text);
      expect(read?.ecLevel).toBe(ecLevel);
    });
  }
});

describe('ida y vuelta real: colores, margen y escala', () => {
  const text = 'https://example.com/';

  it('colores personalizados (fg/bg) se leen', async () => {
    const matrix = await encodeWithWriter(text, 'M');
    const raster = rasterize(matrix, { scale: 4, margin: 4, fg: '#1a237e', bg: '#fff8e1' });
    const read = await readRgba(raster);
    expect(read?.text).toBe(text);
  });

  it.each([1, 4])('margen %i módulos se lee', async (margin) => {
    const matrix = await encodeWithWriter(text, 'M');
    const raster = rasterize(matrix, { scale: 4, margin, fg: '#000000', bg: '#ffffff' });
    const read = await readRgba(raster);
    expect(read?.text).toBe(text);
  });

  it.each([2, 10])('escala %i se lee', async (scale) => {
    const matrix = await encodeWithWriter(text, 'M');
    const raster = rasterize(matrix, { scale, margin: 4, fg: '#000000', bg: '#ffffff' });
    const read = await readRgba(raster);
    expect(read?.text).toBe(text);
  });
});

describe('ida y vuelta real: hueco para el logo', () => {
  // URL de unos 40 caracteres, como la de un producto corto.
  const text = 'https://example.com/p/abcdefghijklmno12';

  it.each([DEFAULT_LOGO_RATIO, MAX_LOGO_RATIO])('con EC H y ratio %f (hueco en color de fondo) se sigue leyendo', async (logoRatio) => {
    const matrix = await encodeWithWriter(text, 'H');
    const raster = rasterize(matrix, { scale: 4, margin: 4, fg: '#000000', bg: '#ffffff', logoRatio });
    const read = await readRgba(raster);
    expect(read?.text).toBe(text);
  });

  it('con un "logo" de ruido (cuadros de 3px) dentro del hueco, con EC H y DEFAULT_LOGO_RATIO, se sigue leyendo', async () => {
    const o = { scale: 4, margin: 4, fg: '#000000', bg: '#ffffff', logoRatio: DEFAULT_LOGO_RATIO };
    const matrix = await encodeWithWriter(text, 'H');
    const raster = rasterize(matrix, o);
    const hole = logoHole(matrix.size, o.logoRatio);
    expect(hole).not.toBeNull();
    if (!hole) return;
    const box = logoBox(hole, o);
    // Rellena el hueco con un patrón de cuadros blancos y negros de 3 px, simulando el ruido de un logo real.
    for (let y = box.y; y < box.y + box.size; y++) {
      for (let x = box.x; x < box.x + box.size; x++) {
        const black = (Math.floor(x / 3) + Math.floor(y / 3)) % 2 === 0;
        const c = black ? 0 : 255;
        const i = (y * raster.width + x) * 4;
        raster.data.set([c, c, c, 255], i);
      }
    }
    const read = await readRgba(raster);
    expect(read?.text).toBe(text);
  });
});

describe('ida y vuelta real: Unicode', () => {
  it('se lee igual con letras acentuadas, emoji y griego', async () => {
    const text = 'ñandú 🙂 Ελλάδα';
    const matrix = await encodeWithWriter(text, 'M');
    const raster = rasterize(matrix, { scale: 4, margin: 4, fg: '#000000', bg: '#ffffff' });
    const read = await readRgba(raster);
    expect(read?.text).toBe(text);
  });
});

describe('encodeWithWriter: demasiado largo', () => {
  it('rechaza con QrTooLongError', async () => {
    await expect(encodeWithWriter('x'.repeat(5000), 'H')).rejects.toBeInstanceOf(QrTooLongError);
  });
});
