// Ataques de una página maliciosa contra el panel que Mirilla dibuja dentro de ella
// (hallazgos de la auditoría de seguridad del 2026-09-27). La build E2E abre el shadow DOM para poder inspeccionarlo.

import type { Page } from '@playwright/test';
import { callMenu, expect, history, openPage, tabIdOf, test } from './setup';

declare const chrome: any;

const QR = '<img id="qr" src="/fixtures/qr-url.png" style="position:absolute;left:40px;top:200px">';

/** Estado del panel visto desde dentro del shadow DOM. */
const panel = (page: Page) =>
  page.evaluate(() => {
    const host = document.querySelector('mirilla-ui') as HTMLElement | null;
    const root = host?.shadowRoot;
    const danger = root?.querySelector('.qr-danger') as HTMLElement | null;
    const cs = host ? getComputedStyle(host) : null;
    return {
      attached: !!host?.isConnected,
      open: !!root?.querySelector('.panel'),
      hostDisplay: cs?.display,
      hostVisibility: cs?.visibility,
      hostOpacity: cs?.opacity,
      dangerColor: danger ? getComputedStyle(danger).color : null,
      dangerBackground: danger ? getComputedStyle(danger).backgroundColor : null,
    };
  });

async function scanDangerousQr(page: Page, sw: Parameters<typeof history>[0]) {
  await page.bringToFront();
  await callMenu(sw, 'scanVisible', await tabIdOf(sw, page));
  await expect.poll(() => history(sw)).toEqual(['https://www.paypal.com@evil.example/login']);
  await expect.poll(async () => (await panel(page)).open).toBe(true);
}

test('una hoja de estilos hostil no puede ocultar el panel ni borrar el aviso de peligro', async ({ context, sw, pages }) => {
  const page = await openPage(
    context,
    pages,
    '/css',
    `<style>
      mirilla-ui { display:none !important; visibility:hidden !important; opacity:0 !important;
                   --qr-danger-fg: transparent !important; --qr-danger-bg: transparent !important; --qr-highlight: transparent !important; }
    </style>${QR}`,
  );
  await scanDangerousQr(page, sw);
  const p = await panel(page);
  expect(p.hostDisplay).not.toBe('none');
  expect(p.hostVisibility).toBe('visible');
  expect(p.hostOpacity).toBe('1');
  expect(p.dangerColor).toBe('rgb(179, 38, 30)');
  expect(p.dangerBackground).toBe('rgb(252, 232, 230)');
});

test('un Escape sintético de la página no cierra el panel; uno real sí', async ({ context, sw, pages }) => {
  const page = await openPage(context, pages, '/esc', QR);
  await scanDangerousQr(page, sw);
  await page.evaluate(() => {
    for (const target of [window, document, document.body]) target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  await page.waitForTimeout(200);
  expect((await panel(page)).open).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await panel(page)).open).toBe(false);
});

test('si la página arranca el panel del DOM mientras está abierto, vuelve a aparecer', async ({ context, sw, pages }) => {
  const page = await openPage(context, pages, '/remove', QR);
  await scanDangerousQr(page, sw);
  await page.evaluate(() => document.querySelector('mirilla-ui')!.remove());
  await expect.poll(async () => (await panel(page)).attached).toBe(true);
});

test('«Copiar» en el panel nunca dispara un evento copy que la página pueda secuestrar', async ({ context, sw, pages }) => {
  const page = await openPage(
    context,
    pages,
    '/copy',
    `<script>
      window.__hijacked = 0;
      for (const t of [window, document]) t.addEventListener('copy', (e) => { window.__hijacked++; e.clipboardData.setData('text/plain', 'HIJACKED'); e.preventDefault(); }, true);
    </script>${QR}`,
  );
  await scanDangerousQr(page, sw);
  // Por posición y no por nombre: al pulsarlo, su texto cambia y un localizador por nombre dejaría de encontrarlo.
  const copy = page.locator('mirilla-ui .qr-actions .qr-btn').last();
  await expect(copy).toHaveText('Copy content');
  await copy.click();
  // En http no hay API segura del portapapeles: no se copia y se explica, en lugar de usar execCommand.
  await expect(copy).toHaveText("Couldn't copy safely on this page");
  expect(await page.evaluate(() => (window as any).__hijacked)).toBe(0);
});

test('un resultado peligroso marca el icono de la extensión, que la página no puede tocar', async ({ context, sw, pages }) => {
  const page = await openPage(context, pages, '/badge', QR);
  await scanDangerousQr(page, sw);
  const tabId = await tabIdOf(sw, page);
  expect(await sw.evaluate((tabId) => chrome.action.getBadgeText({ tabId }), tabId)).toBe('!');
});
