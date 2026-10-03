// Fase 4.2: recuadros sobre los códigos leídos de una captura (buscar en lo visible, seleccionar área
// y el menú contextual sobre una imagen recortada), numerados igual que su tarjeta en el panel.

import { readFileSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { callMenu, dragAround, expect, fixture, openPage, tabIdOf, test } from './setup';

declare const chrome: any;

const dataUrl = (name: string) => `data:image/png;base64,${readFileSync(fixture(name)).toString('base64')}`;

/** Rectángulo (en px CSS) de un elemento, dentro del shadow root abierto o de la página. */
async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('elemento sin caja: ¿no está visible?');
  return b;
}

function center(b: { x: number; y: number; width: number; height: number }) {
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

function contains(outer: { x: number; y: number; width: number; height: number }, p: { x: number; y: number }) {
  return p.x >= outer.x && p.x <= outer.x + outer.width && p.y >= outer.y && p.y <= outer.y + outer.height;
}

/** Mapa de las 3 imágenes de referencia: el texto que las identifica en la tarjeta y su posición en la página. */
const IMAGES = {
  wifi: { file: 'qr-wifi.png', left: 40, top: 40, match: (t: string) => t.includes('Casa') || t.includes('secreto123') },
  ean: { file: 'ean13.png', left: 420, top: 60, match: (t: string) => t.includes('8412345678905') },
  url: { file: 'qr-url.png', left: 820, top: 300, match: (t: string) => t.includes('evil.example') },
} as const;

function layout(images: Record<string, { file: string; left: number; top: number }>) {
  return Object.values(images)
    .map((i) => `<img src="/fixtures/${i.file}" style="position:absolute;left:${i.left}px;top:${i.top}px">`)
    .join('\n');
}

/** Para cada tarjeta, su recuadro y la imagen que le corresponde (por contenido, no por orden). */
async function cardsWithMarks(page: Page, images: Record<string, { file: string; left: number; top: number; match: (t: string) => boolean }>) {
  const cards = page.locator('mirilla-ui .qr-card');
  const count = await cards.count();
  const out: { card: Locator; mark: Locator; img: Locator; key: string }[] = [];
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    const text = (await card.textContent()) ?? '';
    const n = await card.locator('.qr-num').textContent();
    const [key, ref] = Object.entries(images).find(([, v]) => v.match(text))!;
    out.push({ card, mark: page.locator(`mirilla-ui .mark[data-n="${n}"]`), img: page.locator(`img[src="/fixtures/${ref.file}"]`), key });
  }
  return out;
}

/** El recuadro contiene el centro de su imagen y no es mucho mayor que ella. */
async function expectMarkOverlaysImage(mark: Locator, img: Locator) {
  const markBox = await box(mark);
  const imgBox = await box(img);
  expect(contains(markBox, center(imgBox)), `el centro de la imagen (${JSON.stringify(center(imgBox))}) debería caer dentro del recuadro (${JSON.stringify(markBox)})`).toBe(true);
  expect(markBox.width).toBeLessThan(imgBox.width * 1.5);
  expect(markBox.height).toBeLessThan(imgBox.height * 1.5);
}

test('buscar en lo visible: numera las tarjetas y dibuja un recuadro sobre cada código', async ({ context, sw, pages }) => {
  const page = await openPage(context, pages, '/marcar', layout(IMAGES));
  await page.bringToFront();
  await callMenu(sw, 'scanVisible', await tabIdOf(sw, page));

  await expect(page.locator('mirilla-ui .qr-card')).toHaveCount(3);
  const matched = await cardsWithMarks(page, IMAGES);
  expect(matched.map((m) => m.key).sort()).toEqual(['ean', 'url', 'wifi']);

  for (const { mark, img, key } of matched) {
    await expect(mark).toHaveCount(1);
    await expectMarkOverlaysImage(mark, img);
    if (key === 'url') await expect(mark).toHaveClass(/mark-danger/);
    else await expect(mark).not.toHaveClass(/mark-danger/);
  }

  await page.screenshot({ path: 'test-results/marcar.png' });
});

test('pasar el ratón por una tarjeta resalta su recuadro, y deja de hacerlo al salir', async ({ context, sw, pages }) => {
  const page = await openPage(context, pages, '/marcar-hover', layout(IMAGES));
  await page.bringToFront();
  await callMenu(sw, 'scanVisible', await tabIdOf(sw, page));
  await expect(page.locator('mirilla-ui .qr-card')).toHaveCount(3);

  const card = page.locator('mirilla-ui .qr-card').nth(1);
  const n = await card.locator('.qr-num').textContent();
  const mark = page.locator(`mirilla-ui .mark[data-n="${n}"]`);

  await expect(mark).not.toHaveClass(/hot/);
  await card.hover();
  await expect(mark).toHaveClass(/hot/);
  await expect(card).toHaveClass(/hot/);
  // Se aparta el ratón a una esquina libre de la página.
  await page.mouse.move(5, 5);
  await expect(mark).not.toHaveClass(/hot/);
  await expect(card).not.toHaveClass(/hot/);
});

test.describe('los recuadros se quitan cuando la página deja de valer la posición que tenían', () => {
  async function tallPage(context: Parameters<typeof openPage>[0], pages: Parameters<typeof openPage>[1]) {
    return openPage(
      context,
      pages,
      '/marcar-scroll',
      `<div style="height:2000px"></div>\n${layout(IMAGES)}`,
    );
  }

  test('al hacer scroll', async ({ context, sw, pages }) => {
    const page = await tallPage(context, pages);
    await page.bringToFront();
    await callMenu(sw, 'scanVisible', await tabIdOf(sw, page));
    await expect(page.locator('mirilla-ui .qr-card')).toHaveCount(3);
    await expect(page.locator('mirilla-ui .mark')).toHaveCount(3);

    await page.mouse.wheel(0, 300);

    await expect(page.locator('mirilla-ui .mark')).toHaveCount(0);
    // El panel con las tarjetas sigue abierto: solo se quitan los recuadros.
    await expect(page.locator('mirilla-ui .qr-card')).toHaveCount(3);
  });

  test('al cerrar el panel', async ({ context, sw, pages }) => {
    const page = await openPage(context, pages, '/marcar-cerrar', layout(IMAGES));
    await page.bringToFront();
    await callMenu(sw, 'scanVisible', await tabIdOf(sw, page));
    await expect(page.locator('mirilla-ui .mark')).toHaveCount(3);

    await page.locator('mirilla-ui .close').click();

    await expect(page.locator('mirilla-ui .mark')).toHaveCount(0);
    await expect(page.locator('mirilla-ui .panel')).toHaveCount(0);
  });

  test('al cambiar el tamaño de la ventana', async ({ context, sw, pages }) => {
    const page = await openPage(context, pages, '/marcar-resize', layout(IMAGES));
    await page.bringToFront();
    await callMenu(sw, 'scanVisible', await tabIdOf(sw, page));
    await expect(page.locator('mirilla-ui .mark')).toHaveCount(3);

    await page.setViewportSize({ width: 1000, height: 700 });

    await expect(page.locator('mirilla-ui .mark')).toHaveCount(0);
    // El panel sigue abierto.
    await expect(page.locator('mirilla-ui .qr-card')).toHaveCount(3);
  });
});

test('seleccionar área: el recuadro cae sobre la imagen recortada, con el desplazamiento del recorte aplicado', async ({ context, sw, pages }) => {
  const page = await openPage(context, pages, '/marcar-seleccion', `<img id="qr" src="/fixtures/qr-url.png" style="position:absolute;left:300px;top:200px">`);
  await callMenu(sw, 'startSelection', await tabIdOf(sw, page));
  await page.bringToFront();
  await page.locator('mirilla-ui .select-layer').waitFor();
  await dragAround(page, (await page.locator('#qr').boundingBox())!);

  await expect(page.locator('mirilla-ui .qr-card')).toHaveCount(1);
  await expect(page.locator('mirilla-ui .mark')).toHaveCount(1);
  await expectMarkOverlaysImage(page.locator('mirilla-ui .mark'), page.locator('#qr'));
  await expect(page.locator('mirilla-ui .mark')).toHaveClass(/mark-danger/);
});

test('camino fetch del menú contextual (imagen data:): el panel no dibuja recuadros ni numera la tarjeta', async ({ context, sw, pages }) => {
  const src = dataUrl('qr-safe.png');
  const page = await openPage(context, pages, '/marcar-fetch', `<img src="${src}" style="position:absolute;top:4000px">`);
  await callMenu(sw, 'readImage', await tabIdOf(sw, page), src);

  await expect(page.locator('mirilla-ui .qr-card')).toHaveCount(1);
  await expect(page.locator('mirilla-ui .mark')).toHaveCount(0);
  await expect(page.locator('mirilla-ui .qr-num')).toHaveCount(0);
});

test.describe('pantalla HiDPI (devicePixelRatio 2)', () => {
  test.use({ dpr: 2 });

  test('el recuadro sigue cayendo sobre la imagen con píxeles físicos al doble', async ({ context, sw, pages }) => {
    const page = await openPage(context, pages, '/marcar-hidpi', `<img id="qr" src="/fixtures/qr-safe.png" style="position:absolute;left:500px;top:250px">`);
    expect(await page.evaluate(() => devicePixelRatio)).toBe(2);
    await page.bringToFront();
    await callMenu(sw, 'scanVisible', await tabIdOf(sw, page));

    await expect(page.locator('mirilla-ui .mark')).toHaveCount(1);
    await expectMarkOverlaysImage(page.locator('mirilla-ui .mark'), page.locator('#qr'));
  });
});

test('zoom del navegador al 150 %: el recuadro sigue cayendo sobre el código', async ({ context, sw, pages }) => {
  const page = await openPage(context, pages, '/marcar-zoom', `<img id="qr" src="/fixtures/qr-safe.png" style="position:absolute;left:300px;top:150px">`);
  const tabId = await tabIdOf(sw, page);
  await sw.evaluate((tabId) => chrome.tabs.setZoom(tabId, 1.5), tabId);
  await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(1.5);
  await page.bringToFront();
  await callMenu(sw, 'scanVisible', tabId);

  await expect(page.locator('mirilla-ui .mark')).toHaveCount(1);
  await expectMarkOverlaysImage(page.locator('mirilla-ui .mark'), page.locator('#qr'));
});
