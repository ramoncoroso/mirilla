// Genera un QR (PNG) con zxing-wasm/writer. Se importa bajo demanda desde el popup:
// el .wasm del codificador solo se descarga cuando alguien pide generar un código.

import { browser } from 'wxt/browser';
import { prepareZXingModule, writeBarcode } from 'zxing-wasm/writer';

let module: Promise<unknown> | null = null;
const getURL = browser.runtime.getURL as (path: string) => string;

export async function generateQr(text: string): Promise<Blob> {
  // Igual que el lector: el .wasm del paquete, en bytes, para que zxing no intente cargarlo de su CDN por defecto.
  module ??= fetch(getURL('/zxing_writer.wasm'))
    .then((res) => res.arrayBuffer())
    .then((wasmBinary) => prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true }));
  await module;
  const { image, error } = await writeBarcode(text, { format: 'QRCode', ecLevel: 'M', scale: 8 });
  if (error || !image) throw new Error(error || 'QR generation failed');
  return image;
}
