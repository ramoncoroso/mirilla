// Genera las imágenes de prueba con el codificador de zxing-wasm.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
  'qr-event.png': [
    'BEGIN:VEVENT\nSUMMARY:Reuni\u00F3n de equipo\nDTSTART;TZID=Europe/Madrid:20261015T100000\nDTEND;TZID=Europe/Madrid:20261015T110000\nLOCATION:Sala 2\nDESCRIPTION:Orden del d\u00EDa en https://example.com/acta\nEND:VEVENT',
    { format: 'QRCode', scale: 5 },
  ],
  'qr-otp.png': ['otpauth://totp/Ejemplo:ana@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Ejemplo', { format: 'QRCode', scale: 5 }],
  'qr-bitcoin.png': ['bitcoin:1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2?amount=0.01&label=Donativo', { format: 'QRCode', scale: 5 }],
  'qr-bitcoin-bad.png': ['bitcoin:1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN3?amount=0.01&label=Donativo', { format: 'QRCode', scale: 5 }],

  // 4.3: añadidos EAN-2/EAN-5. El escritor de zxing acepta "GTIN ADDON" (separados por un espacio) y dibuja
  // los dos símbolos juntos en una sola imagen. "9780141439518" es un ISBN-13 real (Bookland, prefijo 978).
  'ean13-addon-price.png': ['9780141439518 51234', { format: 'EAN13', scale: 4 }], // EAN-5 "5" + 1234 → $12.34
  'ean13-addon-issue.png': ['8412345678905 07', { format: 'EAN13', scale: 4 }], // EAN-2 → número de ejemplar 7
};

// 4.3: un ejemplar de cada formato que el escritor de zxing sabe crear (los que, al leerlos, se reconocen con
// identidad propia: UPC-A se lee como EAN-13 y los de la familia DataBar/ITF se agrupan entre sí, así que no se
// repiten como fixture aparte). Contenido pensado para que, al leerlo, cada uno caiga en el tipo esperado
// (producto, enlace o texto).
const formatCodes = {
  qrcode: ['https://example.org/formats/qr', { format: 'QRCode', scale: 4 }],
  microqr: ['MIRILLA', { format: 'MicroQRCode', scale: 4 }],
  rmqr: ['https://example.org/formats/rmqr', { format: 'RMQRCode', scale: 4 }],
  datamatrix: ['https://example.org/formats/dm', { format: 'DataMatrix', scale: 4 }],
  aztec: ['https://example.org/formats/az', { format: 'Aztec', scale: 4 }],
  pdf417: ['https://example.org/formats/pdf417', { format: 'PDF417', scale: 3 }],
  'ean-13': ['8412345678905', { format: 'EAN13', scale: 4 }],
  'ean-8': ['12345670', { format: 'EAN8', scale: 4 }],
  'upc-a': ['036000291452', { format: 'UPCA', scale: 4 }], // se lee como EAN-13 (mismo patrón de barras con un 0 delante)
  'upc-e': ['04252614', { format: 'UPCE', scale: 4 }],
  code128: ['MIRILLA-128', { format: 'Code128', scale: 3 }],
  code39: ['CODE39TEST', { format: 'Code39', scale: 3 }],
  code93: ['CODE93TEST', { format: 'Code93', scale: 3 }],
  codabar: ['A1234567890A', { format: 'Codabar', scale: 3 }],
  itf: ['1234567890', { format: 'ITF', scale: 3 }],
  'itf-14': ['00012345678905', { format: 'ITF14', scale: 3 }], // se lee como ITF a secas (ver spec de formatos)
  'databar-omni': ['08412345678905', { format: 'DataBarOmni', scale: 3 }],
  'databar-stacked': ['08412345678905', { format: 'DataBarStk', scale: 3 }],
  'databar-limited': ['08412345678905', { format: 'DataBarLtd', scale: 3 }],
  'databar-expanded': ['(01)08412345678905(17)281200', { format: 'DataBarExp', options: 'gs1', scale: 3 }],
  'databar-expanded-stacked': ['(01)08412345678905(17)281200', { format: 'DataBarExpStk', options: 'gs1', scale: 3 }],
  maxicode: ['MIRILLA TEST', { format: 'MaxiCode', scale: 3 }],
  telepen: ['MIRILLA', { format: 'Telepen', scale: 3 }], // se lee como "Telepen Alpha"
  dxfilmedge: ['16-0', { format: 'DXFilmEdge', scale: 3 }], // "tipo de película-número de fotograma"
};
const formatsDir = new URL('./fixtures/formats/', import.meta.url);
await mkdir(formatsDir, { recursive: true });
for (const [name, [text, opts]] of Object.entries(formatCodes)) {
  const { image, error } = await writeBarcode(text, opts);
  if (error || !image) {
    console.log('saltado (el escritor lo rechaza):', name, '—', error);
    continue;
  }
  await writeFile(new URL(`${name}.png`, formatsDir), Buffer.from(await image.arrayBuffer()));
  console.log('ok', `formats/${name}.png`);
}
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
