// Fase 4 · 4.0 «Actuar con un clic»: limpiar rastreadores al abrir o copiar, y denunciar.

import type { BrowserContext } from '@playwright/test';
import { expect, fixture, test } from './setup';

/** Responde a cualquier URL de ese host sin salir a la red, y devuelve la URL de la pestaña que se abre. */
async function openedUrl(context: BrowserContext, host: string, click: () => Promise<void>) {
  await context.route((url) => url.hostname === host, (route) => route.fulfill({ contentType: 'text/html', body: 'ok' }));
  const [page] = await Promise.all([context.waitForEvent('page'), click()]);
  await page.waitForURL((url) => url.hostname === host);
  return page.url();
}

test('quita los parámetros de rastreo al abrir, lo dice, y se puede desactivar en los ajustes', async ({ context, extId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.setInputFiles('#file', fixture('qr-utm.png'));

  // Se muestra la URL tal cual (es la que se analiza) y se avisa de lo que se quita.
  await expect(popup.locator('.qr-url')).toContainText('utm_source=qr');
  await expect(popup.locator('.qr-trackers')).toHaveText('Tracking parameters are removed when you open or copy it: utm_source, fbclid.');
  await expect(popup.getByRole('button', { name: 'Copy link' })).toBeVisible();
  const open = () => popup.getByRole('button', { name: 'Open', exact: true }).click();
  expect(await openedUrl(context, 'example.com', open)).toBe('https://example.com/promo?id=7');

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extId}/options.html`);
  await expect(options.locator('#clean-links')).toBeChecked();
  await options.locator('#clean-links').uncheck();

  await popup.bringToFront();
  await popup.setInputFiles('#file', fixture('qr-utm.png'));
  await expect(popup.locator('.qr-trackers')).toHaveCount(0);
  expect(await openedUrl(context, 'example.com', open)).toBe('https://example.com/promo?utm_source=qr&id=7&fbclid=abc');

  await options.reload();
  await expect(options.locator('#clean-links')).not.toBeChecked();
});

test('«Report» solo con Precaución o Peligro: abre el formulario de Safe Browsing', async ({ context, extId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);

  await popup.setInputFiles('#file', fixture('qr-safe.png'));
  await expect(popup.locator('.qr-card')).toHaveAttribute('data-verdict', 'clear');
  await expect(popup.getByRole('button', { name: 'Report' })).toHaveCount(0);

  await popup.setInputFiles('#file', fixture('qr-http.png'));
  const report = () => popup.getByRole('button', { name: 'Report' }).click();
  const url = await openedUrl(context, 'safebrowsing.google.com', report);
  expect(url).toBe('https://safebrowsing.google.com/safebrowsing/report_phish/?hl=en');
  // Solo en castellano se ofrece INCIBE.
  await expect(popup.getByRole('link', { name: /INCIBE/ })).toHaveCount(0);
});

test.describe('en castellano', () => {
  test.use({ lang: 'es' });

  test('«Denunciar» también ofrece avisar a INCIBE con el enlace ya escrito', async ({ context, extId }) => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await popup.setInputFiles('#file', fixture('qr-url.png'));
    await expect(popup.getByRole('button', { name: 'Denunciar' })).toBeVisible();
    const mail = popup.getByRole('link', { name: 'Avisar a INCIBE por email' });
    const href = (await mail.getAttribute('href'))!;
    expect(href.startsWith('mailto:incidencias@incibe-cert.es?subject=')).toBe(true);
    expect(decodeURIComponent(href)).toContain('https://www.paypal.com@evil.example/login');
    await popup.setViewportSize({ width: 360, height: 560 });
    await popup.screenshot({ path: 'test-results/denunciar-es.png' });
  });
});
