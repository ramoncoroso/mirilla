import { test as base, chromium, expect, type BrowserContext, type Worker } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Estos callbacks se ejecutan dentro de la extensión, donde existe la API chrome.*.
declare const chrome: any;

const extPath = path.resolve('.output-e2e/chrome-mv3');
const fixture = (name: string) => path.resolve('tests/e2e/fixtures', name);

const test = base.extend<{ context: BrowserContext; sw: Worker; extId: string }>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`],
    });
    // Página de pruebas servida desde un origen http normal.
    await context.route('http://pruebas.test/**', (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/') {
        return route.fulfill({
          contentType: 'text/html; charset=utf-8',
          body: `<!doctype html><body style="margin:0;background:#fff">
            <h1 style="margin:20px;font:20px sans-serif">Página de pruebas</h1>
            <img id="qr" src="/qr-url.png" style="position:absolute;left:300px;top:200px">
          </body>`,
        });
      }
      return route.fulfill({ contentType: 'image/png', body: readFileSync(fixture(path.basename(url.pathname))) });
    });
    await use(context);
    await context.close();
  },
  sw: async ({ context }, use) => {
    await use(context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker')));
  },
  extId: async ({ sw }, use) => {
    await use(new URL(sw.url()).host);
  },
});

test('el popup lee una imagen de fichero (WASM cargado con la CSP de la extensión)', async ({ context, extId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);

  await popup.setInputFiles('#file', fixture('qr-wifi.png'));
  await expect(popup.locator('.qr-kind')).toHaveText('Red WiFi');
  await expect(popup.locator('.qr-dl')).toContainText('secreto123');
  await expect(popup.getByRole('button', { name: 'Copiar contraseña' })).toBeVisible();

  await popup.setInputFiles('#file', fixture('qr-url.png'));
  await expect(popup.locator('.qr-danger')).toContainText('www.paypal.com@');
  await expect(popup.locator('.qr-domain')).toHaveText('evil.example');
  await expect(popup.getByRole('button', { name: 'Abrir de todos modos' })).toBeVisible();
  await popup.setViewportSize({ width: 360, height: 520 });
  await popup.screenshot({ path: 'test-results/popup.png' });

  await popup.setInputFiles('#file', fixture('ean13.png'));
  await expect(popup.locator('.qr-badge').first()).toHaveText('EAN-13');
  await expect(popup.locator('.qr-text')).toHaveText('8412345678905');

  await popup.setInputFiles('#file', fixture('datamatrix-gs1.png'));
  await expect(popup.locator('.qr-badge').first()).toHaveText('Data Matrix');

  // Todo lo leído queda en el historial.
  await popup.reload();
  await popup.locator('summary').click();
  await expect(popup.locator('#history li')).toHaveCount(4);
});

test('seleccionar un área de la página: inyecta, captura, recorta y decodifica en el service worker', async ({ context, sw, extId }) => {
  const page = await context.newPage();
  await page.goto('http://pruebas.test/');
  await page.waitForFunction(() => (document.getElementById('qr') as HTMLImageElement).complete);
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'http://pruebas.test/*' }))[0]!.id!);

  // Lo que hace el botón del popup.
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.evaluate((tabId) => chrome.runtime.sendMessage({ type: 'start-selection', tabId }), tabId);
  await popup.close();
  await page.bringToFront();

  const box = (await page.locator('#qr').boundingBox())!;
  await page.waitForTimeout(300);
  await page.mouse.move(box.x - 20, box.y - 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
  await page.mouse.move(box.x + box.width + 20, box.y + box.height + 20, { steps: 5 });
  await page.mouse.up();

  await expect
    .poll(async () => sw.evaluate(async () => ((await chrome.storage.local.get('history')).history as { text: string }[] | undefined)?.[0]?.text))
    .toBe('https://www.paypal.com@evil.example/login');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/seleccion-area.png' });
});
