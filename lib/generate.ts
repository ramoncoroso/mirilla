// Genera un QR (PNG) con zxing-wasm/writer. Se importa bajo demanda desde el popup:
// el .wasm del codificador solo se descarga cuando alguien pide generar un código.

import { browser } from 'wxt/browser';
import { prepareZXingModule, writeBarcode } from 'zxing-wasm/writer';

let prepared = false;
const getURL = browser.runtime.getURL as (path: string) => string;

export async function generateQr(text: string): Promise<Blob> {
  if (!prepared) {
    // Igual que el lector: el .wasm va en el paquete (lo copia el hook de wxt.config.ts), nunca desde un CDN.
    prepareZXingModule({
      overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? getURL('/zxing_writer.wasm') : prefix + path) },
    });
    prepared = true;
  }
  const { image, error } = await writeBarcode(text, { format: 'QRCode', ecLevel: 'M', scale: 8 });
  if (error || !image) throw new Error(error || 'QR generation failed');
  return image;
}
