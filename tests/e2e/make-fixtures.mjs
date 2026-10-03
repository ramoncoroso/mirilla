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
  'qr-http.png': ['http://example.com/', { format: 'QRCode', scale: 6 }],
  'qr-utm.png': ['https://example.com/promo?utm_source=qr&id=7&fbclid=abc', { format: 'QRCode', scale: 6 }],
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

// PDF de tres páginas (como el adjunto de un email de quishing): la 1 sin códigos, la 2 con el QR peligroso y la
// 3 con uno normal. El QR se dibuja como vectores (rectángulos), como lo hacen los generadores de PDF.
async function qrRects(text) {
  const { svg, error } = await writeBarcode(text, { format: 'QRCode' });
  if (error) throw new Error(error);
  const modules = Number(/<svg width="(\d+)"/.exec(svg)[1]);
  // Los módulos negros van en un path de rectángulos «Mx yhWvHh-WZ» (el <rect> es el fondo blanco).
  const rects = [...svg.matchAll(/M([\d.]+) ([\d.]+)h([\d.]+)v([\d.]+)h-[\d.]+Z/g)].map((m) => m.slice(1).map(Number));
  return { rects, modules };
}

function pdf(pages) {
  // pages: contenido (operadores PDF) de cada página A4 (595×842 pt).
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', ''];
  const kids = [];
  for (const content of pages) {
    const streamId = objects.length + 2;
    kids.push(`${objects.length + 1} 0 R`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${streamId} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const at = Buffer.byteLength(out);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}

const qrPage = ({ rects, modules }, size = 200, x = 200, y = 400) => {
  const scale = size / modules;
  // El QR, en negro, con el origen arriba a la izquierda (el SVG) convertido al de PDF (abajo a la izquierda).
  return `0 g\n${rects.map(([rx, ry, w, h]) => `${(x + rx * scale).toFixed(2)} ${(y + size - (ry + h) * scale).toFixed(2)} ${(w * scale).toFixed(2)} ${(h * scale).toFixed(2)} re`).join('\n')}\nf`;
};
const textPage = '0.6 g\n60 700 475 12 re f\n60 670 400 12 re f\n60 640 440 12 re f';
await writeFile(
  new URL('quishing.pdf', dir),
  pdf([textPage, qrPage(await qrRects('https://www.paypal.com@evil.example/login')), qrPage(await qrRects('https://example.com/'))]),
);
console.log('ok', 'quishing.pdf');
