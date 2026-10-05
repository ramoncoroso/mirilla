// Codifica un QR con zxing-wasm/writer y devuelve su matriz de módulos (el dibujo lo hace lib/qr-draw.ts).
// Se importa bajo demanda: el .wasm del codificador solo se descarga cuando alguien pide generar un código.

import { browser } from 'wxt/browser';
import { prepareZXingModule, writeBarcode } from 'zxing-wasm/writer';
import { drawToCanvas, matrixFromSymbol, pixelSize, type QrMatrix } from './qr-draw';

export type EcLevel = 'L' | 'M' | 'Q' | 'H';

let module: Promise<unknown> | null = null;
const getURL = browser.runtime.getURL as (path: string) => string;

/** Lanza `QrTooLongError` si el contenido no cabe en un QR con ese nivel de corrección. */
export async function encodeQr(text: string, ecLevel: EcLevel = 'M'): Promise<QrMatrix> {
  // Igual que el lector: el .wasm del paquete, en bytes, para que zxing no intente cargarlo de su CDN por defecto.
  module ??= fetch(getURL('/zxing_writer.wasm'))
    .then((res) => res.arrayBuffer())
    .then((wasmBinary) => prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true }));
  await module;
  return encodeWithWriter(text, ecLevel);
}

export class QrTooLongError extends Error {}

/** La codificación en sí, con el módulo ya preparado (los tests lo preparan desde node_modules). */
export async function encodeWithWriter(text: string, ecLevel: EcLevel): Promise<QrMatrix> {
  const { symbol, error } = await writeBarcode(text, { format: 'QRCode', options: `ecLevel=${ecLevel}`, scale: 1, addQuietZones: false });
  if (error || !symbol?.width) throw /too (long|big|large)|capacity|exceed/i.test(error) ? new QrTooLongError(error) : new Error(error || 'QR generation failed');
  return matrixFromSymbol(symbol);
}

/** PNG en blanco y negro con el margen estándar (el «QR de esta página» del popup). */
export async function generateQr(text: string): Promise<Blob> {
  const matrix = await encodeQr(text, 'M');
  const options = { scale: 8, margin: 4, fg: '#000000', bg: '#ffffff' };
  const side = pixelSize(matrix, options);
  const canvas = new OffscreenCanvas(side, side);
  drawToCanvas(canvas.getContext('2d')!, matrix, options);
  return canvas.convertToBlob({ type: 'image/png' });
}
