import { formatToLabel, prepareZXingModule, readBarcodes, type ReadResult } from 'zxing-wasm/reader';
import { browser } from 'wxt/browser';
import { parseGs1, toHri } from './gs1';

export interface Code {
  /** Texto para mostrar, copiar y guardar (en GS1, la forma legible "(01)…(10)…"). */
  text: string;
  format: string;
  /** Contenido GS1 (identificadores de aplicación) según zxing. */
  gs1: boolean;
  /** Solo GS1: datos en bruto con separadores GS, que es lo que se interpreta. */
  raw?: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

let module: Promise<unknown> | null = null;

// El .wasm lo copia el hook de wxt.config.ts, así que WXT no lo incluye en sus rutas tipadas de getURL.
const getURL = browser.runtime.getURL as (path: string) => string;

/**
 * Carga el .wasm del paquete y se lo da a zxing en bytes (wasmBinary). Así zxing nunca intenta localizarlo
 * por su cuenta: por defecto apunta a un CDN, y MV3 prohíbe ejecutar código remoto.
 */
function ensureModule() {
  module ??= fetch(getURL('/zxing_reader.wasm'))
    .then((res) => res.arrayBuffer())
    .then((wasmBinary) => prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true }));
  return module;
}

/**
 * Límites de tamaño: por encima, OffscreenCanvas falla o el service worker se queda sin memoria.
 * Una imagen mayor se reduce; ampliar (para códigos pequeños) nunca supera estos límites.
 */
const MAX_SIDE = 8192;
const MAX_PIXELS = 24_000_000;

/** `fast`: para vídeo en directo (cámara, pantalla), donde llega otro fotograma enseguida: sin girar ni invertir. */
export async function decodeImageData(image: ImageData, { fast = false } = {}): Promise<Code[]> {
  await ensureModule();
  const results = await readBarcodes(image, {
    tryHarder: true,
    tryRotate: !fast,
    tryInvert: !fast,
    tryDownscale: true,
    maxNumberOfSymbols: 32,
    // Plain conserva los separadores GS de los datos GS1; la forma legible la genera toHri().
    textMode: 'Plain',
  });
  return dedupe(results.filter((r) => r.isValid).map(toCode));
}

/** Decodifica un Blob de imagen (cualquier formato que el navegador sepa pintar), opcionalmente recortado. */
export async function decodeBlob(blob: Blob, crop?: Rect): Promise<Code[]> {
  let bitmap: ImageBitmap;
  try {
    bitmap = crop
      ? await createImageBitmap(blob, Math.round(crop.x), Math.round(crop.y), Math.round(crop.width), Math.round(crop.height))
      : await createImageBitmap(blob);
  } catch (e) {
    // createImageBitmap no acepta SVG. En páginas con DOM (el popup) se pinta con <img>; en el service worker
    // se relanza y quien llama recurre a recortar la captura de la pestaña.
    if (crop || typeof document === 'undefined') throw e;
    bitmap = await bitmapViaImageElement(blob);
  }
  try {
    return await decodeBitmap(bitmap);
  } finally {
    bitmap.close();
  }
}

async function bitmapViaImageElement(blob: Blob): Promise<ImageBitmap> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return await createImageBitmap(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function decodeBitmap(bitmap: ImageBitmap): Promise<Code[]> {
  const fit = maxScale(bitmap);
  const codes = await decodeImageData(rasterize(bitmap, Math.min(1, fit)));
  if (codes.length > 0) return codes;
  // Códigos muy pequeños (favicons, miniaturas): reintenta ampliando, sin pasar de los límites.
  const minSide = Math.min(bitmap.width, bitmap.height);
  const up = Math.min(4, Math.ceil(400 / minSide), fit);
  if (minSide < 400 && up > 1) {
    try {
      return await decodeImageData(rasterize(bitmap, up));
    } catch {
      return codes; // si el reintento falla, cuenta como "no encontrado", no como error de lectura
    }
  }
  return codes;
}

/** Escala máxima con la que la imagen cabe en los límites de lado y de píxeles. */
function maxScale(bitmap: ImageBitmap): number {
  return Math.min(MAX_SIDE / bitmap.width, MAX_SIDE / bitmap.height, Math.sqrt(MAX_PIXELS / (bitmap.width * bitmap.height)));
}

function rasterize(bitmap: ImageBitmap, scale: number): ImageData {
  const w = Math.max(1, Math.floor(bitmap.width * scale));
  const h = Math.max(1, Math.floor(bitmap.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error(`No se pudo crear un canvas de ${w}×${h}`);
  // Fondo blanco: los PNG con transparencia suelen tener el código en negro sobre nada.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

function toCode(r: ReadResult): Code {
  const format = formatLabel(r.format);
  if (r.contentType !== 'GS1') return { text: r.text, format, gs1: false };
  const parsed = parseGs1(r.text);
  return { text: toHri(parsed.elements, parsed.rest), format, gs1: true, raw: r.text };
}

function dedupe(codes: Code[]): Code[] {
  const seen = new Set<string>();
  return codes.filter((c) => {
    const key = `${c.format}\u0000${c.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const LABELS: Record<string, string> = {
  QRCode: 'QR',
  MicroQRCode: 'Micro QR',
  RMQRCode: 'rMQR',
  DataMatrix: 'Data Matrix',
  EAN13: 'EAN-13',
  EAN8: 'EAN-8',
  UPCA: 'UPC-A',
  UPCE: 'UPC-E',
  Code128: 'Code 128',
  Code39: 'Code 39',
  Code93: 'Code 93',
  PDF417: 'PDF417',
  Aztec: 'Aztec',
  ITF: 'ITF',
  ITF14: 'ITF-14',
};

function formatLabel(format: string) {
  return LABELS[format] ?? formatToLabel(format) ?? format;
}
