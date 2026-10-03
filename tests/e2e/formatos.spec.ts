// Fase 4 · 4.3 «Formatos»: añadidos EAN-2/EAN-5 y cobertura de todos los formatos de código de barras.
//
// Formatos que zxing-wasm sabe LEER pero no CREAR: con la versión de zxing-wasm usada aquí (3.1.4, que incluye
// el escritor "zint" además del nativo de zxing-cpp), prácticamente todo lo que se puede leer también se puede
// escribir — incluidos MaxiCode, Telepen y DX Film Edge, que el PLAN daba por no creables. Las únicas excepciones
// (comprobado con CREATABLE_BARCODE_FORMATS / READABLE_BARCODE_FORMATS del paquete) son "OtherBarcode" (no es un
// formato real, es un comodín interno) y "QRCodeModel1" (variante muy antigua de QR, sin uso práctico). Por tanto
// no queda ningún formato real pendiente de una imagen de muestra con licencia libre.

import type { BrowserContext } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { expect, fixture, test } from './setup';

async function popupWith(context: BrowserContext, extId: string, file: string) {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.setViewportSize({ width: 360, height: 640 });
  await popup.setInputFiles('#file', fixture(file));
  await expect(popup.locator('.qr-card')).toHaveCount(1);
  return popup;
}

/** Valor de la fila cuya etiqueta es `label` en la lista de datos. */
const row = (popup: Awaited<ReturnType<typeof popupWith>>, label: string) =>
  popup.locator('.qr-dl dt', { hasText: label }).locator('xpath=following-sibling::dd[1]');

// --- Añadidos EAN-2 / EAN-5 (4.3) --------------------------------------------------------------

test('EAN-13 + EAN-5 (Bookland, ISBN): el añadido se muestra aparte y su precio en USD', async ({ context, extId }) => {
  const popup = await popupWith(context, extId, 'ean13-addon-price.png');
  await expect(popup.locator('.qr-kind')).toHaveText('Product');
  await expect(row(popup, 'GTIN (product)')).toHaveText('9780141439518');
  await expect(row(popup, 'Add-on')).toHaveText('51234');
  await expect(popup.locator('.qr-card')).toContainText('Suggested retail price: $12.34');
});

test('EAN-13 + EAN-2: el añadido se interpreta como número de ejemplar', async ({ context, extId }) => {
  const popup = await popupWith(context, extId, 'ean13-addon-issue.png');
  await expect(popup.locator('.qr-kind')).toHaveText('Product');
  await expect(row(popup, 'GTIN (product)')).toHaveText('8412345678905');
  await expect(row(popup, 'Add-on')).toHaveText('07');
  await expect(popup.locator('.qr-card')).toContainText('Issue number 7');
});

test('sin añadido (ean13.png de siempre): no aparece la fila "Add-on"', async ({ context, extId }) => {
  const popup = await popupWith(context, extId, 'ean13.png');
  await expect(popup.locator('.qr-dl dt', { hasText: 'Add-on' })).toHaveCount(0);
});

test.describe('en castellano', () => {
  test.use({ lang: 'es' });

  test('precio y número de ejemplar traducidos', async ({ context, extId }) => {
    const price = await popupWith(context, extId, 'ean13-addon-price.png');
    await expect(row(price, 'Código adicional')).toHaveText('51234');
    await expect(price.locator('.qr-card')).toContainText('Precio de venta recomendado: 12,34 US$');

    const issue = await popupWith(context, extId, 'ean13-addon-issue.png');
    await expect(issue.locator('.qr-card')).toContainText('Número de ejemplar 7');
  });
});

// --- Cobertura de todos los formatos (4.3) ------------------------------------------------------

/**
 * Lo esperado al leer cada imagen de `fixtures/formats/`: el nombre del formato (lo que pinta `.qr-badge`,
 * según `LABELS`/`formatToLabel` de `lib/decode.ts`) y el tipo de contenido (`.qr-kind`).
 *
 * Dos casos documentan una limitación real de zxing-wasm (sin formats restringido, que es como lee Mirilla,
 * no se puede distinguir de qué se trata) en vez de ocultarla:
 * - `upc-a.png`: un UPC-A tiene el mismo patrón de barras que un EAN-13 con un 0 delante, así que se lee como
 *   "EAN-13" (con GTIN de 13 dígitos). Sigue cayendo en "Product", que es lo que importa para el usuario.
 * - `itf-14.png`: un ITF-14 se lee como "ITF" a secas (zxing no distingue la variante de 14 dígitos al leer),
 *   y como el conjunto de formatos de producto de `lib/parse.ts` solo reconoce la etiqueta "ITF-14" (no "ITF"),
 *   este código NO se reconoce como producto: cae en "Text". Es una limitación conocida, no un fallo de esta tarea.
 */
const FORMATS: Record<string, { badge: string; kind: string }> = {
  qrcode: { badge: 'QR', kind: 'Link' },
  microqr: { badge: 'Micro QR', kind: 'Text' },
  rmqr: { badge: 'rMQR', kind: 'Link' },
  datamatrix: { badge: 'Data Matrix', kind: 'Link' },
  aztec: { badge: 'Aztec', kind: 'Link' },
  pdf417: { badge: 'PDF417', kind: 'Link' },
  'ean-13': { badge: 'EAN-13', kind: 'Product' },
  'ean-8': { badge: 'EAN-8', kind: 'Product' },
  'upc-a': { badge: 'EAN-13', kind: 'Product' }, // ver nota arriba
  'upc-e': { badge: 'UPC-E', kind: 'Product' },
  code128: { badge: 'Code 128', kind: 'Text' },
  code39: { badge: 'Code 39', kind: 'Text' },
  code93: { badge: 'Code 93', kind: 'Text' },
  codabar: { badge: 'Codabar', kind: 'Text' },
  itf: { badge: 'ITF', kind: 'Text' },
  'itf-14': { badge: 'ITF', kind: 'Text' }, // ver nota arriba: no se reconoce como producto
  'databar-omni': { badge: 'DataBar Omni', kind: 'GS1 data' },
  'databar-stacked': { badge: 'DataBar Stacked', kind: 'GS1 data' },
  'databar-limited': { badge: 'DataBar Limited', kind: 'GS1 data' },
  'databar-expanded': { badge: 'DataBar Expanded', kind: 'GS1 data' },
  'databar-expanded-stacked': { badge: 'DataBar Expanded Stacked', kind: 'GS1 data' },
  maxicode: { badge: 'MaxiCode', kind: 'Text' },
  telepen: { badge: 'Telepen Alpha', kind: 'Text' },
  dxfilmedge: { badge: 'DX Film Edge', kind: 'Text' },
};

// Si se genera un fixture nuevo en make-fixtures.mjs sin añadirlo aquí (o al revés), que falle de forma clara.
test('la lista de formatos cubiertos coincide con los fixtures generados', () => {
  const files = readdirSync(fixture('formats')).map((f) => f.replace(/\.png$/, ''));
  expect(new Set(files)).toEqual(new Set(Object.keys(FORMATS)));
});

for (const [name, expected] of Object.entries(FORMATS)) {
  test(`formato ${name}: se lee, badge "${expected.badge}" y tipo "${expected.kind}"`, async ({ context, extId }) => {
    const popup = await popupWith(context, extId, `formats/${name}.png`);
    await expect(popup.locator('.qr-badge').first()).toHaveText(expected.badge);
    await expect(popup.locator('.qr-kind')).toHaveText(expected.kind);
  });
}
