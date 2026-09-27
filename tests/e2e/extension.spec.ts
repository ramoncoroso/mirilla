import { callMenu, dragAround, expect, fixture, history, openPage, tabIdOf, test } from './setup';

test('el popup lee una imagen de fichero (WASM cargado con la CSP de la extensión)', async ({ context, extId, sw }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await expect(popup.locator('#scan')).toHaveText('Scan visible area');

  await popup.setInputFiles('#file', fixture('qr-wifi.png'));
  await expect(popup.locator('.qr-kind')).toHaveText('Wi-Fi network');
  await expect(popup.locator('.qr-dl')).toContainText('secreto123');
  await expect(popup.getByRole('button', { name: 'Copy password' })).toBeVisible();

  await popup.setInputFiles('#file', fixture('qr-url.png'));
  await expect(popup.locator('.qr-danger')).toContainText('www.paypal.com@');
  await expect(popup.locator('.qr-domain')).toHaveText('evil.example');
  await expect(popup.getByRole('button', { name: 'Open anyway' })).toBeVisible();
  await popup.setViewportSize({ width: 360, height: 520 });
  await popup.screenshot({ path: 'test-results/popup-en.png' });

  await popup.setInputFiles('#file', fixture('ean13.png'));
  await expect(popup.locator('.qr-badge').first()).toHaveText('EAN-13');
  await expect(popup.locator('.qr-kind')).toHaveText('Product');
  await expect(popup.locator('.qr-dl')).toContainText('8412345678905');

  await popup.setInputFiles('#file', fixture('datamatrix-gs1.png'));
  await expect(popup.locator('.qr-badge').first()).toHaveText('Data Matrix');

  // Todo lo leído queda en el historial (se espera a que termine la última escritura antes de recargar).
  await expect.poll(async () => (await history(sw)).length).toBe(4);
  await popup.reload();
  await popup.locator('summary').click();
  await expect(popup.locator('#history li')).toHaveCount(4);
});

test('seleccionar un área de la página: inyecta, captura, recorta y decodifica en el service worker', async ({ context, sw, pages }) => {
  const page = await openPage(context, pages, '/', `
    <h1 style="margin:20px;font:20px sans-serif">Página de pruebas</h1>
    <img id="qr" src="/fixtures/qr-url.png" style="position:absolute;left:300px;top:200px">`);

  await callMenu(sw, 'startSelection', await tabIdOf(sw, page));
  await page.bringToFront();
  await page.locator('mirilla-ui .select-layer').waitFor();
  await dragAround(page, (await page.locator('#qr').boundingBox())!);

  await expect.poll(() => history(sw)).toEqual(['https://www.paypal.com@evil.example/login']);
  await page.locator('mirilla-ui .qr-card').waitFor();
  await page.screenshot({ path: 'test-results/seleccion-area.png' });
});

test.describe('interfaz en castellano', () => {
  test.use({ lang: 'es' });

  test('el popup y los resultados salen traducidos', async ({ context, extId }) => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await expect(popup.locator('#scan')).toHaveText('Buscar en lo visible');
    await expect(popup.locator('html')).toHaveAttribute('lang', 'es');

    await popup.setInputFiles('#file', fixture('qr-wifi.png'));
    await expect(popup.locator('.qr-kind')).toHaveText('Red WiFi');
    await expect(popup.getByRole('button', { name: 'Copiar contraseña' })).toBeVisible();

    await popup.setInputFiles('#file', fixture('qr-url.png'));
    await expect(popup.locator('.qr-danger')).toContainText('Contiene «www.paypal.com@» antes del dominio');
    await expect(popup.getByRole('button', { name: 'Abrir de todos modos' })).toBeVisible();
    await popup.setViewportSize({ width: 360, height: 520 });
    await popup.screenshot({ path: 'test-results/popup-es.png' });
  });
});
