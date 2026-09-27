import { prepareZXingModule, readBarcodes, type ReadResult } from 'zxing-wasm/reader';
import { browser } from 'wxt/browser';

export interface Code {
  text: string;
  format: string;
  /** Contenido GS1 (AIs) según zxing; se usará para interpretar etiquetas logísticas. */
  gs1: boolean;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

let prepared = false;

// El .wasm lo copia el hook de wxt.config.ts, así que WXT no lo incluye en sus rutas tipadas de getURL.
const getURL = browser.runtime.getURL as (path: string) => string;

function ensureModule() {
  if (prepared) return;
  // El .wasm va dentro del paquete: MV3 prohíbe cargar código remoto (por defecto zxing-wasm usa un CDN).
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? getURL('/zxing_reader.wasm') : prefix + path),
    },
  });
  prepared = true;
}

export async function decodeImageData(image: ImageData): Promise<Code[]> {
  ensureModule();
  const results = await readBarcodes(image, {
    tryHarder: true,
    tryRotate: true,
    tryInvert: true,
    tryDownscale: true,
    maxNumberOfSymbols: 32,
    textMode: 'HRI',
  });
  return dedupe(results.filter((r) => r.isValid).map(toCode));
}

/** Decodifica un Blob de imagen (cualquier formato que el navegador sepa pintar), opcionalmente recortado. */
export async function decodeBlob(blob: Blob, crop?: Rect): Promise<Code[]> {
  const bitmap = crop
    ? await createImageBitmap(blob, Math.round(crop.x), Math.round(crop.y), Math.round(crop.width), Math.round(crop.height))
    : await createImageBitmap(blob);
  try {
    return await decodeBitmap(bitmap);
  } finally {
    bitmap.close();
  }
}

async function decodeBitmap(bitmap: ImageBitmap): Promise<Code[]> {
  const codes = await decodeImageData(rasterize(bitmap, 1));
  if (codes.length > 0) return codes;
  // Códigos muy pequeños (favicons, miniaturas): reintenta ampliando.
  const minSide = Math.min(bitmap.width, bitmap.height);
  if (minSide < 400) return decodeImageData(rasterize(bitmap, Math.min(4, Math.ceil(400 / minSide))));
  return codes;
}

function rasterize(bitmap: ImageBitmap, scale: number): ImageData {
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  // Fondo blanco: los PNG con transparencia suelen tener el código en negro sobre nada.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

function toCode(r: ReadResult): Code {
  return { text: r.text, format: formatLabel(r.format), gs1: r.contentType === 'GS1' };
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
  return LABELS[format] ?? format;
}
