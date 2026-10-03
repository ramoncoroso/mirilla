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
  'datamatrix-gs1.png': ['(01)08412345678905(17)281200(10)LOTE42(3103)001250(21)ABC', { format: 'DataMatrix', options: 'gs1', scale: 8 }],
  'gs1-128.png': ['(00)106141411234567897(37)24(400)PEDIDO-7', { format: 'Code128', options: 'gs1', scale: 2 }],
  'gs1-expired.png': ['(01)09506000134352(17)240101', { format: 'DataMatrix', options: 'gs1', scale: 8 }],
  'gs1-bad-check.png': ['(01)09506000134353', { format: 'DataMatrix', options: 'gs1', scale: 8 }],
  'qr-digital-link.png': ['https://id.gs1.org/01/09506000134352/10/ABC123?17=271231', { format: 'QRCode', scale: 5 }],
  'ean13.png': ['8412345678905', { format: 'EAN13', scale: 3 }],
  'qr-js.png': ['javascript:alert(document.cookie)', { format: 'QRCode', scale: 6 }],
  'qr-safe.png': ['https://example.com/', { format: 'QRCode', scale: 6 }],
  'qr-trusted.png': ['https://www.mibancolocal.es/', { format: 'QRCode', scale: 6 }],
  'qr-imita.png': ['https://mibancoloca1.es/login', { format: 'QRCode', scale: 6 }],
  'qr-bidi.png': ['https://evil.example/\u202Emoc.lapyap.www//:sptth', { format: 'QRCode', scale: 6 }],
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
