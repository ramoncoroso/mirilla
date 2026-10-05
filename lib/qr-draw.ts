// Dibujo de un QR desde su matriz de módulos (generador, 4.4): colores, margen, tamaño y hueco para el logo.
// Se dibuja aquí y no con el PNG de zxing para poder aplicar todo eso. Sin dependencias: la lógica pura
// (hueco, colores, RGBA) se prueba en tests/qr-draw.test.ts; canvas y SVG se prueban en el navegador.

export interface QrMatrix {
  /** Módulos por lado (21 en la versión 1, sin margen). */
  size: number;
  /** size × size, fila a fila: 1 = módulo oscuro. */
  dark: Uint8Array;
}

/** Del `symbol` de zxing (imagen de un canal sin margen, 0 = oscuro) a la matriz. */
export function matrixFromSymbol(symbol: { data: ArrayLike<number>; width: number; height: number }): QrMatrix {
  if (symbol.width !== symbol.height || symbol.width <= 0) throw new Error('QR symbol must be square');
  const dark = new Uint8Array(symbol.width * symbol.width);
  for (let i = 0; i < dark.length; i++) dark[i] = (symbol.data[i] ?? 255) < 128 ? 1 : 0;
  return { size: symbol.width, dark };
}

export interface DrawOptions {
  /** Píxeles por módulo (canvas y RGBA; en SVG, unidades del viewBox). */
  scale: number;
  /** Margen en módulos (el estándar pide 4). */
  margin: number;
  /** "#rrggbb". */
  fg: string;
  bg: string;
  /** Lado del logo como fracción del lado del código (sin margen); 0 o ausente, sin logo. Se limita a MAX_LOGO_RATIO. */
  logoRatio?: number;
}

/** Más grande tapa demasiados módulos incluso con corrección H (30 %): 0,3 del lado ≈ 9 % del área. */
export const MAX_LOGO_RATIO = 0.3;
export const DEFAULT_LOGO_RATIO = 0.22;

/** Cuadrado de módulos que se dejan en blanco para el logo, centrado: `start` y `count` en módulos. */
export interface Hole {
  start: number;
  count: number;
}

export function logoHole(size: number, ratio = 0): Hole | null {
  const r = Math.min(Math.max(ratio, 0), MAX_LOGO_RATIO);
  let count = Math.floor(size * r);
  // Misma paridad que el lado (siempre impar en QR) para que quede centrado al módulo.
  if (count % 2 !== size % 2) count--;
  if (count < 3) return null;
  return { start: (size - count) / 2, count };
}

const inHole = (hole: Hole | null, x: number, y: number) =>
  !!hole && x >= hole.start && x < hole.start + hole.count && y >= hole.start && y < hole.start + hole.count;

/** Lado total en píxeles (con margen). */
export const pixelSize = (m: QrMatrix, o: DrawOptions) => (m.size + 2 * o.margin) * o.scale;

/** Tramos horizontales de módulos oscuros, fuera del hueco del logo: [x, y, largo] en módulos. */
export function darkRuns(m: QrMatrix, hole: Hole | null): [number, number, number][] {
  const runs: [number, number, number][] = [];
  for (let y = 0; y < m.size; y++) {
    let x = 0;
    while (x < m.size) {
      if (!m.dark[y * m.size + x] || inHole(hole, x, y)) {
        x++;
        continue;
      }
      const from = x;
      while (x < m.size && m.dark[y * m.size + x] && !inHole(hole, x, y)) x++;
      runs.push([from, y, x - from]);
    }
  }
  return runs;
}

// --- Colores --------------------------------------------------------------------------------------

export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] : null;
}

/** Luminancia relativa WCAG 2. */
export function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * `inverted`: módulos más claros que el fondo, que muchos lectores (los de las cámaras, sobre todo) no leen.
 * `lowContrast`: por debajo de 3:1 falla con poca luz o en pantallas. La comprobación final es leerlo de vuelta.
 */
export type ColorCheck = 'ok' | 'lowContrast' | 'inverted' | 'invalid';

export function checkColors(fg: string, bg: string): ColorCheck {
  const f = parseHex(fg);
  const b = parseHex(bg);
  if (!f || !b) return 'invalid';
  if (luminance(f) >= luminance(b)) return 'inverted';
  return contrastRatio(f, b) < 3 ? 'lowContrast' : 'ok';
}

function assertColors(o: DrawOptions): [[number, number, number], [number, number, number]] {
  const f = parseHex(o.fg);
  const b = parseHex(o.bg);
  if (!f || !b) throw new Error('Colors must be #rrggbb');
  return [f, b];
}

// --- Salidas --------------------------------------------------------------------------------------

/** Píxeles RGBA (hueco del logo en el color de fondo). Para los tests y para leerlo de vuelta sin canvas. */
export function rasterize(m: QrMatrix, o: DrawOptions): { data: Uint8ClampedArray; width: number; height: number } {
  const [f, b] = assertColors(o);
  const side = pixelSize(m, o);
  const data = new Uint8ClampedArray(side * side * 4);
  for (let i = 0; i < side * side; i++) data.set([b[0], b[1], b[2], 255], i * 4);
  for (const [x, y, len] of darkRuns(m, logoHole(m.size, o.logoRatio))) {
    for (let py = (y + o.margin) * o.scale; py < (y + o.margin + 1) * o.scale; py++) {
      for (let px = (x + o.margin) * o.scale; px < (x + o.margin + len) * o.scale; px++) data.set([f[0], f[1], f[2], 255], (py * side + px) * 4);
    }
  }
  return { data, width: side, height: side };
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Dibuja en un canvas ya del tamaño `pixelSize`. El logo, si lo hay, se encaja en el hueco con un módulo de aire. */
export function drawToCanvas(ctx: Ctx2D, m: QrMatrix, o: DrawOptions, logo?: CanvasImageSource & { width: number; height: number }) {
  assertColors(o);
  const side = pixelSize(m, o);
  ctx.fillStyle = o.bg;
  ctx.fillRect(0, 0, side, side);
  ctx.fillStyle = o.fg;
  const hole = logoHole(m.size, o.logoRatio);
  for (const [x, y, len] of darkRuns(m, hole)) ctx.fillRect((x + o.margin) * o.scale, (y + o.margin) * o.scale, len * o.scale, o.scale);
  if (hole && logo) {
    const box = logoBox(hole, o);
    const fit = Math.min(box.size / logo.width, box.size / logo.height);
    const w = logo.width * fit;
    const h = logo.height * fit;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(logo, box.x + (box.size - w) / 2, box.y + (box.size - h) / 2, w, h);
  }
}

/** Zona donde va el logo, dentro del hueco y con un módulo de aire por cada lado. */
export function logoBox(hole: Hole, o: DrawOptions): { x: number; y: number; size: number } {
  const inset = hole.count > 4 ? 1 : 0;
  return {
    x: (hole.start + o.margin + inset) * o.scale,
    y: (hole.start + o.margin + inset) * o.scale,
    size: (hole.count - 2 * inset) * o.scale,
  };
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * SVG con elementos y atributos (nunca concatenando texto del usuario): fondo, un `<path>` con los módulos
 * (solo números) y, si hay logo, un `<image>` con un PNG en data: que hemos dibujado nosotros (`logoPng`).
 */
export function buildSvg(doc: Document, m: QrMatrix, o: DrawOptions, logoPng?: { href: string; width: number; height: number }): SVGSVGElement {
  assertColors(o);
  const units = m.size + 2 * o.margin;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('viewBox', `0 0 ${units} ${units}`);
  svg.setAttribute('width', String(units * o.scale));
  svg.setAttribute('height', String(units * o.scale));
  svg.setAttribute('shape-rendering', 'crispEdges');

  const bg = doc.createElementNS(SVG_NS, 'rect');
  bg.setAttribute('width', String(units));
  bg.setAttribute('height', String(units));
  bg.setAttribute('fill', o.bg);
  svg.append(bg);

  const hole = logoHole(m.size, o.logoRatio);
  const path = doc.createElementNS(SVG_NS, 'path');
  path.setAttribute('fill', o.fg);
  path.setAttribute('d', darkRuns(m, hole).map(([x, y, len]) => `M${x + o.margin} ${y + o.margin}h${len}v1h-${len}z`).join(''));
  svg.append(path);

  if (hole && logoPng) {
    if (!logoPng.href.startsWith('data:image/png;base64,')) throw new Error('Logo must be a PNG data URL');
    const box = logoBox(hole, { ...o, scale: 1 });
    const fit = Math.min(box.size / logoPng.width, box.size / logoPng.height);
    const w = logoPng.width * fit;
    const h = logoPng.height * fit;
    const image = doc.createElementNS(SVG_NS, 'image');
    image.setAttribute('href', logoPng.href);
    image.setAttribute('x', String(box.x + (box.size - w) / 2));
    image.setAttribute('y', String(box.y + (box.size - h) / 2));
    image.setAttribute('width', String(w));
    image.setAttribute('height', String(h));
    svg.append(image);
  }
  return svg;
}
