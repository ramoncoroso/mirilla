// Fase 1.5: caminos que no cubren los tests básicos (menú contextual, buscar en lo visible,
// HiDPI, zoom, SVG, páginas protegidas, imágenes difíciles, historial y apertura de enlaces).

import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { callMenu, dragAround, expect, fixture, history, openPage, ORIGIN, tabIdOf, test } from './setup';

declare const chrome: any;

const dataUrl = (name: string) => `data:image/png;base64,${readFileSync(fixture(name)).toString('base64')}`;

test.describe('menú contextual «Leer código de esta imagen»', () => {
  test('camino fetch: lee la imagen aunque esté fuera de la vista (data: URL)', async ({ context, sw, pages }) => {
    // Colocada muy abajo: si funcionara por captura de pantalla, no podría verla.
    const src = dataUrl('qr-safe.png');
    const page = await openPage(context, pages, '/fetch', `<img src="${src}" style="position:absolute;top:4000px">`);
    await callMenu(sw, 'readImage', await tabIdOf(sw, page), src);
    await expect.poll(() => history(sw)).toEqual(['https://example.com/']);
  });

  test('camino de recorte: un SVG (el service worker no puede rasterizarlo) se lee de la captura', async ({ context, sw, pages }) => {
    const page = await openPage(context, pages, '/svg', `<img src="/fixtures/qr.svg" style="position:absolute;left:200px;top:150px">`);
    await page.bringToFront();
    await callMenu(sw, 'readImage', await tabIdOf(sw, page), `${ORIGIN}/fixtures/qr.svg`);
    await expect.poll(() => history(sw)).toEqual(['https://example.org/svg']);
  });

  test('imagen medio fuera de la vista: no rompe y no inventa resultados', async ({ context, sw, pages }) => {
    const page = await openPage(context, pages, '/partial', `<img src="/fixtures/qr.svg" style="position:absolute;left:200px;top:-120px">`);
    await page.bringToFront();
    await callMenu(sw, 'readImage', await tabIdOf(sw, page), `${ORIGIN}/fixtures/qr.svg`);
    expect(await history(sw)).toEqual([]);
  });
});

test('buscar en lo visible: lee varios códigos de formatos distintos de una vez', async ({ context, sw, pages }) => {
  const page = await openPage(context, pages, '/multi', `
    <img src="/fixtures/qr-wifi.png" style="position:absolute;left:40px;top:40px">
    <img src="/fixtures/ean13.png" style="position:absolute;left:420px;top:60px">
    <img src="/fixtures/datamatrix-gs1.png" style="position:absolute;left:820px;top:40px">`);
  await page.bringToFront();
  await callMenu(sw, 'scanVisible', await tabIdOf(sw, page));
  await expect.poll(async () => (await history(sw)).length).toBe(3);
  const texts = await history(sw);
  expect(texts).toContain('WIFI:T:WPA;S:Casa;P:secreto123;;');
  expect(texts).toContain('8412345678905');
  expect(texts.some((t) => t.includes('8412345678905') && t !== '8412345678905')).toBe(true); // GS1 Data Matrix
});

test('el panel de Mirilla no tapa los códigos: un QR en la esquina superior derecha se relee con el panel abierto', async ({ context, sw, pages }) => {
  const page = await openPage(context, pages, '/esquina', `<img src="/fixtures/qr-safe.png" style="position:absolute;right:16px;top:16px">`);
  await page.bringToFront();
  const tabId = await tabIdOf(sw, page);
  await callMenu(sw, 'scanVisible', tabId);
  await expect.poll(() => history(sw)).toEqual(['https://example.com/']);

  // El panel de resultados queda abierto justo encima del código; la segunda lectura tiene que ocultarlo antes de capturar.
  await sw.evaluate(() => chrome.storage.local.clear());
  await callMenu(sw, 'scanVisible', tabId);
  await expect.poll(() => history(sw)).toEqual(['https://example.com/']);
});

async function selectQr(page: Page, sw: Parameters<typeof history>[0]) {
  await callMenu(sw, 'startSelection', await tabIdOf(sw, page));
  await page.bringToFront();
  await page.locator('mirilla-ui .select-layer').waitFor();
  await dragAround(page, (await page.locator('#qr').boundingBox())!);
}

test.describe('pantalla HiDPI (devicePixelRatio 2)', () => {
  test.use({ dpr: 2 });

  test('la selección de área recorta bien con píxeles físicos al doble', async ({ context, sw, pages }) => {
    const page = await openPage(context, pages, '/hidpi', `<img id="qr" src="/fixtures/qr-safe.png" style="position:absolute;left:500px;top:250px">`);
    expect(await page.evaluate(() => devicePixelRatio)).toBe(2);
    await selectQr(page, sw);
    await expect.poll(() => history(sw)).toEqual(['https://example.com/']);
  });
});

test('zoom del navegador al 150 %: la selección de área sigue recortando el sitio correcto', async ({ context, sw, pages }) => {
  const page = await openPage(context, pages, '/zoom', `<img id="qr" src="/fixtures/qr-safe.png" style="position:absolute;left:300px;top:150px">`);
  const tabId = await tabIdOf(sw, page);
  await sw.evaluate((tabId) => chrome.tabs.setZoom(tabId, 1.5), tabId);
  await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(1.5);
  await selectQr(page, sw);
  await expect.poll(() => history(sw)).toEqual(['https://example.com/']);
});

test('página protegida (chrome://): no se puede inyectar y la extensión no se rompe', async ({ context, sw }) => {
  const page = await context.newPage();
  await page.goto('chrome://version');
  await page.bringToFront();
  // Sin el permiso "tabs", Chrome no expone la URL de las pestañas chrome://: se toma la activa.
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id);
  await callMenu(sw, 'startSelection', tabId);
  await callMenu(sw, 'scanVisible', tabId);
  await callMenu(sw, 'readImage', tabId, 'chrome://version/x.png');
  // El service worker sigue respondiendo y no se ha guardado nada.
  expect(await history(sw)).toEqual([]);
});

test.describe('popup', () => {
  /** Dibuja una imagen de prueba con transformaciones en un canvas de la web de pruebas y la devuelve como PNG. */
  async function variant(page: Page, draw: string, width = 400, height = 400): Promise<Buffer> {
    const url = await page.evaluate(
      async ({ draw, width, height }) => {
        const load = (src: string) =>
          new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
          });
        const canvas = Object.assign(document.createElement('canvas'), { width, height });
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);
        await new Function('ctx', 'load', `return (async () => { ${draw} })()`)(ctx, load);
        return canvas.toDataURL('image/png');
      },
      { draw, width, height },
    );
    return Buffer.from(url.split(',')[1]!, 'base64');
  }

  test('lee imágenes difíciles: invertida, girada y borrosa, diminuta y con varios códigos', async ({ context, extId, pages }) => {
    const helper = await openPage(context, pages, '/canvas', '');
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    const upload = async (name: string, buffer: Buffer) => popup.setInputFiles('#file', { name, mimeType: 'image/png', buffer });

    // Blanco sobre negro.
    await upload('invertida.png', await variant(helper, `ctx.filter = 'invert(1)'; ctx.drawImage(await load('/fixtures/qr-safe.png'), 0, 0, 400, 400);`));
    await expect(popup.locator('.qr-url')).toHaveText('https://example.com/');

    // Girada 25°, desenfocada y con poco contraste sobre fondo gris.
    await upload(
      'girada.png',
      await variant(
        helper,
        `ctx.fillStyle = '#9a9a9a'; ctx.fillRect(0, 0, 500, 500);
         ctx.translate(250, 250); ctx.rotate(25 * Math.PI / 180); ctx.filter = 'blur(1.2px) contrast(0.55)';
         ctx.drawImage(await load('/fixtures/qr-safe.png'), -150, -150, 300, 300);`,
        500,
        500,
      ),
    );
    await expect(popup.locator('.qr-url')).toHaveText('https://example.com/');

    // Diminuta: unos 2 px por módulo.
    await upload('diminuta.png', await variant(helper, `ctx.imageSmoothingEnabled = false; ctx.drawImage(await load('/fixtures/qr-safe.png'), 0, 0, 58, 58);`, 58, 58));
    await expect(popup.locator('.qr-url')).toHaveText('https://example.com/');

    // Tres códigos en una sola imagen.
    await upload(
      'varios.png',
      await variant(
        helper,
        `ctx.drawImage(await load('/fixtures/qr-wifi.png'), 20, 20);
         ctx.drawImage(await load('/fixtures/ean13.png'), 20, 260);
         ctx.drawImage(await load('/fixtures/datamatrix-gs1.png'), 420, 20);`,
        800,
        420,
      ),
    );
    await expect(popup.locator('.qr-card')).toHaveCount(3);
  });

  test('con el historial desactivado no se guarda nada', async ({ context, extId, sw }) => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await popup.locator('summary').click();
    await popup.locator('#history-enabled').uncheck();
    await expect(popup.locator('#history li')).toHaveText('History is turned off.');
    await popup.setInputFiles('#file', fixture('qr-safe.png'));
    await expect(popup.locator('.qr-card .qr-url')).toHaveText('https://example.com/');
    // Se reactiva y se lee otro código: si el primero se hubiera guardado, aparecería también.
    await popup.locator('#history-enabled').check();
    await popup.setInputFiles('#file', fixture('qr-wifi.png'));
    await expect(popup.locator('.qr-card .qr-kind')).toHaveText('Wi-Fi network');
    await expect.poll(() => history(sw)).toEqual(['WIFI:T:WPA;S:Casa;P:secreto123;;']);
  });

  test('«Open» abre el enlace en una pestaña nueva; «javascript:» no se puede abrir', async ({ context, extId }) => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`);

    await popup.setInputFiles('#file', fixture('qr-safe.png'));
    const [opened] = await Promise.all([context.waitForEvent('page'), popup.getByRole('button', { name: 'Open', exact: true }).click()]);
    await expect.poll(() => opened.url()).toBe('https://example.com/');

    await popup.setInputFiles('#file', fixture('qr-js.png'));
    await expect(popup.locator('.qr-danger')).toContainText('Dangerous “javascript:” scheme');
    await expect(popup.getByRole('button', { name: /^Open/ })).toHaveCount(0);
  });
});
