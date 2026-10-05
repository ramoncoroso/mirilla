// Fase 2: interpretación GS1 (AIs, Digital Link, dígito de control, prefijo) con códigos reales generados por zxing.

import type { BrowserContext } from '@playwright/test';
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
const row = (popup: Awaited<ReturnType<typeof popupWith>>, label: string) => popup.locator('.qr-dl dt', { hasText: label }).locator('xpath=following-sibling::dd[1]');

test('Data Matrix GS1: GTIN, prefijo, lote, peso con decimales y fecha de fin de mes', async ({ context, extId }) => {
  const popup = await popupWith(context, extId, 'datamatrix-gs1.png');
  await expect(popup.locator('.qr-kind')).toHaveText('GS1 data');
  await expect(row(popup, 'GTIN (product) (01)')).toHaveText('08412345678905');
  await expect(row(popup, 'GS1 prefix')).toHaveText('Spain, Andorra');
  await expect(row(popup, 'Batch/lot (10)')).toHaveText('LOTE42');
  await expect(row(popup, 'Net weight (3103)')).toHaveText('1.250 kg');
  await expect(row(popup, 'Expiry date (17)')).toHaveText('December 2028 (end of month)');
  await expect(row(popup, 'Serial number (21)')).toHaveText('ABC');
  await expect(popup.locator('.qr-note')).toContainText('not where the product was made');
  await expect(popup.locator('.qr-finding')).toHaveCount(0);
  await expect(popup.getByRole('button', { name: 'Copy GTIN' })).toBeVisible();
  await popup.screenshot({ path: 'test-results/gs1-en.png' });
});

test('GS1-128 logístico: SSCC, cantidad y pedido', async ({ context, extId }) => {
  const popup = await popupWith(context, extId, 'gs1-128.png');
  await expect(popup.locator('.qr-card .qr-badge')).toHaveText('Code 128');
  await expect(row(popup, 'SSCC (logistic unit) (00)')).toHaveText('106141411234567897');
  await expect(row(popup, 'Quantity (37)')).toHaveText('24');
  await expect(row(popup, 'Order number (400)')).toHaveText('PEDIDO-7');
});

test('avisa de producto caducado y de dígito de control incorrecto', async ({ context, extId }) => {
  const expired = await popupWith(context, extId, 'gs1-expired.png');
  await expect(expired.locator('.qr-warn')).toHaveText('Expired: the date has passed.');

  const bad = await popupWith(context, extId, 'gs1-bad-check.png');
  await expect(bad.locator('.qr-danger')).toHaveText('Wrong check digit in (01): the number is not valid (the check digit should be 2).');
});

test('QR con GS1 Digital Link: datos GS1 y, además, el análisis del enlace', async ({ context, extId }) => {
  const popup = await popupWith(context, extId, 'qr-digital-link.png');
  await expect(popup.locator('.qr-kind')).toHaveText('GS1 Digital Link');
  await expect(row(popup, 'GTIN (product) (01)')).toHaveText('09506000134352');
  await expect(row(popup, 'Batch/lot (10)')).toHaveText('ABC123');
  await expect(row(popup, 'Expiry date (17)')).toHaveText('Dec 31, 2027');
  await expect(popup.locator('.qr-domain')).toHaveText('gs1.org');
  await expect(popup.getByRole('button', { name: 'Open', exact: true })).toBeVisible();
});

test('EAN-13 de producto: prefijo GS1 con su aclaración', async ({ context, extId }) => {
  const popup = await popupWith(context, extId, 'ean13.png');
  await expect(popup.locator('.qr-kind')).toHaveText('Product');
  await expect(row(popup, 'GTIN (product)')).toHaveText('8412345678905');
  await expect(row(popup, 'GS1 prefix')).toHaveText('Spain, Andorra');
});

test.describe('en castellano', () => {
  test.use({ lang: 'es' });

  test('etiquetas, números y fechas con formato español', async ({ context, extId }) => {
    const popup = await popupWith(context, extId, 'datamatrix-gs1.png');
    await expect(popup.locator('.qr-kind')).toHaveText('Datos GS1');
    await expect(row(popup, 'Prefijo GS1')).toHaveText('España, Andorra');
    await expect(row(popup, 'Lote (10)')).toHaveText('LOTE42');
    await expect(row(popup, 'Peso neto (3103)')).toHaveText('1,250 kg');
    await expect(row(popup, 'Fecha de caducidad (17)')).toHaveText('diciembre de 2028 (fin de mes)');
    await popup.screenshot({ path: 'test-results/gs1-es.png' });
  });
});

test.describe('generar el QR de la página actual', () => {
  test('ida y vuelta: el QR generado se vuelve a leer con la URL de la página', async ({ context, extId, sw, pages }) => {
    const { openPage, tabIdOf } = await import('./setup');
    const page = await openPage(context, pages, '/producto?id=42', '<h1>Producto</h1>');
    const tabId = await tabIdOf(sw, page);

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html?tab=${tabId}`);
    // El botón abre una pestaña nueva con create.html, ya relleno con la URL de la página (el popup se cierra).
    const [created] = await Promise.all([context.waitForEvent('page'), popup.getByRole('button', { name: 'QR code of this page' }).click()]);
    await created.waitForLoadState();
    const expectedUrl = `chrome-extension://${extId}/create.html?${new URLSearchParams({ type: 'url', url: 'http://pruebas.test/producto?id=42' })}`;
    await expect(created).toHaveURL(expectedUrl);
    // Decodificando la query se ve el mismo resultado, con independencia de cómo se haya codificado.
    const query = new URL(created.url()).searchParams;
    expect(query.get('type')).toBe('url');
    expect(query.get('url')).toBe('http://pruebas.test/producto?id=42');

    await expect(created.locator('#f-url')).toHaveValue('http://pruebas.test/producto?id=42');
    await expect(created.locator('#check')).toHaveText('Checked: it reads correctly ✓', { timeout: 10_000 });
    await created.setViewportSize({ width: 900, height: 700 });
    await created.screenshot({ path: 'test-results/generar.png' });

    const [download] = await Promise.all([created.waitForEvent('download'), created.locator('#png').click()]);
    expect(download.suggestedFilename()).toBe('qr-pruebas.test.png');

    // Se lee el PNG descargado con el propio lector de Mirilla.
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(chunk as Buffer);
    const reader = await context.newPage();
    await reader.goto(`chrome-extension://${extId}/popup.html`);
    await reader.setInputFiles('#file', { name: 'generado.png', mimeType: 'image/png', buffer: Buffer.concat(chunks) });
    await expect(reader.locator('.qr-card .qr-url')).toHaveText('http://pruebas.test/producto?id=42');
  });

  test('en una página interna del navegador abre el generador vacío, sin dirección que convertir', async ({ context, extId, sw }) => {
    const page = await context.newPage();
    await page.goto('chrome://version');
    await page.bringToFront();
    const tabId = await sw.evaluate(async () => (await (globalThis as any).chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html?tab=${tabId}`);
    const [created] = await Promise.all([context.waitForEvent('page'), popup.getByRole('button', { name: 'QR code of this page' }).click()]);
    await created.waitForLoadState();
    // Sin dirección web en la pestaña activa, se abre sin query: el generador se queda en «Web address» vacío.
    await expect(created).toHaveURL(`chrome-extension://${extId}/create.html`);
    await expect(created.locator('#kind')).toHaveValue('url');
    await expect(created.locator('#f-url')).toHaveValue('');
  });
});
