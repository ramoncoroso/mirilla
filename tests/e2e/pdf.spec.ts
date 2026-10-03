// Fase 4 · 4.1: PDF con un QR dentro (el quishing por adjunto), leído en local con pdf.js en el popup y en la
// página de escaneo. El fixture tiene 3 páginas: la 1 sin códigos, la 2 con el QR peligroso y la 3 con uno normal.

import { expect, fixture, history, test } from './setup';

test('popup: lee todas las páginas de un PDF; la peligrosa sale primero', async ({ context, extId, sw }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.setInputFiles('#file', fixture('quishing.pdf'));

  const pages = popup.locator('.qr-pdf-page');
  await expect(pages).toHaveCount(2, { timeout: 20_000 });
  await expect(pages.nth(0).locator('.qr-pdf-title')).toHaveText('Page 2');
  await expect(pages.nth(0).locator('.qr-card')).toHaveAttribute('data-verdict', 'danger');
  await expect(pages.nth(0).locator('.qr-danger').first()).toContainText('www.paypal.com@');
  await expect(pages.nth(1).locator('.qr-pdf-title')).toHaveText('Page 3');
  await expect(pages.nth(1).locator('.qr-verdict-domain')).toHaveText('example.com');
  await expect(popup.locator('#status')).toBeHidden();
  await expect.poll(async () => (await history(sw)).sort()).toEqual(['https://example.com/', 'https://www.paypal.com@evil.example/login']);
  await popup.setViewportSize({ width: 360, height: 700 });
  await popup.screenshot({ path: 'test-results/pdf-popup.png' });
});

test('página de escaneo: abrir un PDF y ver los resultados por página', async ({ context, extId }) => {
  const scan = await context.newPage();
  await scan.goto(`chrome-extension://${extId}/scan.html?mode=pdf`);
  await expect(scan.locator('#pdf')).toBeFocused();
  await scan.setInputFiles('#pdf-file', fixture('quishing.pdf'));
  await expect(scan.locator('.qr-pdf-page')).toHaveCount(2, { timeout: 20_000 });
  await expect(scan.locator('.qr-pdf-page').first()).toHaveAttribute('data-page', '2');
});

test('un PDF sin códigos o dañado lo dice', async ({ context, extId }) => {
  const scan = await context.newPage();
  await scan.goto(`chrome-extension://${extId}/scan.html`);
  await scan.setInputFiles('#pdf-file', { name: 'roto.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 esto no es un PDF') });
  await expect(scan.locator('#status')).toHaveText("Couldn't open the PDF.", { timeout: 20_000 });
});
