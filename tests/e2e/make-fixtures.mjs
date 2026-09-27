// Genera las imágenes de prueba con el codificador de zxing-wasm.
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { prepareZXingModule, writeBarcode } from 'zxing-wasm/writer';

const require = createRequire(import.meta.url);
const wasmBinary = await readFile(require.resolve('zxing-wasm/writer/zxing_writer.wasm'));
prepareZXingModule({ overrides: { wasmBinary } });

const dir = new URL('./fixtures/', import.meta.url);
const codes = {
  'qr-url.png': ['https://www.paypal.com@evil.example/login', { format: 'QRCode', scale: 6 }],
  'qr-wifi.png': ['WIFI:T:WPA;S:Casa;P:secreto123;;', { format: 'QRCode', scale: 6 }],
  'datamatrix-gs1.png': ['\u001d0108412345678905172612311OLOTE42', { format: 'DataMatrix', scale: 8 }],
  'ean13.png': ['8412345678905', { format: 'EAN13', scale: 3 }],
  'qr-js.png': ['javascript:alert(document.cookie)', { format: 'QRCode', scale: 6 }],
  'qr-safe.png': ['https://example.com/', { format: 'QRCode', scale: 6 }],
};
for (const [name, [text, opts]] of Object.entries(codes)) {
  const { image, error } = await writeBarcode(text, opts);
  if (error || !image) throw new Error(`${name}: ${error}`);
  await writeFile(new URL(name, dir), Buffer.from(await image.arrayBuffer()));
  console.log('ok', name);
}

// SVG: el service worker no puede rasterizarlo y fuerza el camino de recorte de captura.
const { svg, error } = await writeBarcode('https://example.org/svg', { format: 'QRCode', scale: 6 });
if (error) throw new Error(`qr.svg: ${error}`);
await writeFile(new URL('qr.svg', dir), svg);
console.log('ok', 'qr.svg');
