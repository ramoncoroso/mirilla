// Fase 4 · 4.1: página de escaneo con cámara y pantalla. Cámara falsa de Chromium que emite un vídeo con un QR
// (generado con ffmpeg desde los fixtures) y captura de pantalla aceptada automáticamente.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, fixture, history, openPage, test } from './setup';

/** Vídeo y4m de 640×480 con el QR centrado sobre blanco (lo que la cámara falsa de Chromium sabe emitir). */
function cameraVideo(name: string): string {
  mkdirSync('test-results', { recursive: true });
  const out = path.resolve('test-results', name.replace('.png', '.y4m'));
  if (!existsSync(out)) {
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-loop', '1', '-i', fixture(name), '-t', '1', '-r', '10',
      '-vf', 'scale=400:400:flags=neighbor,pad=640:480:(ow-iw)/2:(oh-ih)/2:white', '-pix_fmt', 'yuv420p', out]);
  }
  return out;
}

/** Vídeo sin ningún código (para probar parar sin que una lectura lo cierre antes). */
function blankVideo(): string {
  mkdirSync('test-results', { recursive: true });
  const out = path.resolve('test-results', 'blanco.y4m');
  if (!existsSync(out)) execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=white:s=640x480:d=1:r=10', '-pix_fmt', 'yuv420p', out]);
  return out;
}

test.describe('cámara', () => {
  test.use({
    launchArgs: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${cameraVideo('qr-url.png')}`],
  });

  test('desde el popup: abre la página de escaneo, lee el QR de la cámara, se para y avisa del peligro', async ({ context, extId, sw }) => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    const [scan] = await Promise.all([context.waitForEvent('page'), popup.locator('#scan-camera').click()]);
    await expect(scan).toHaveURL(`chrome-extension://${extId}/scan.html?mode=camera`);
    await expect(scan.locator('h1')).toHaveText('Scan with Mirilla');

    await expect(scan.locator('.qr-card')).toHaveAttribute('data-verdict', 'danger', { timeout: 15_000 });
    await expect(scan.locator('.qr-danger').first()).toContainText('www.paypal.com@');
    // Se para al leer: sin vídeo y con la cámara apagada.
    await expect(scan.locator('#live')).toBeHidden();
    expect(await scan.evaluate(() => (document.getElementById('video') as HTMLVideoElement).srcObject)).toBeNull();
    await expect.poll(() => history(sw)).toEqual(['https://www.paypal.com@evil.example/login']);
    await scan.screenshot({ path: 'test-results/escanear-camara.png' });
  });

});

test.describe('cámara sin código', () => {
  test.use({ launchArgs: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${blankVideo()}`] });

  const cameraOff = (scan: import('@playwright/test').Page) =>
    scan.evaluate(() => (document.getElementById('video') as HTMLVideoElement).srcObject === null);

  test('«Stop» apaga la cámara', async ({ context, extId }) => {
    const scan = await context.newPage();
    await scan.goto(`chrome-extension://${extId}/scan.html`);
    await scan.locator('#camera').click();
    await expect(scan.locator('#live-status')).toHaveText('Point the camera at the code…');
    expect(await cameraOff(scan)).toBe(false);
    await scan.locator('#stop').click();
    await expect(scan.locator('#live')).toBeHidden();
    expect(await cameraOff(scan)).toBe(true);
  });

  test('la cámara se apaga al ocultar la pestaña', async ({ context, extId }) => {
    const scan = await context.newPage();
    await scan.goto(`chrome-extension://${extId}/scan.html?mode=camera`);
    await expect(scan.locator('#live')).toBeVisible();
    await scan.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(scan.locator('#live')).toBeHidden();
    expect(await cameraOff(scan)).toBe(true);
  });
});

test.describe('pantalla', () => {
  // Chromium comparte sin preguntar la pestaña con ese título.
  test.use({ launchArgs: ['--auto-select-tab-capture-source-by-title=QR de prueba'] });

  test('comparte otra pestaña y lee el QR que se ve en ella; deja de compartir al leer', async ({ context, extId, pages, sw }) => {
    await openPage(context, pages, '/pantalla', `<title>QR de prueba</title><img src="/fixtures/qr-safe.png" style="position:absolute;left:100px;top:100px">`);
    const scan = await context.newPage();
    await scan.goto(`chrome-extension://${extId}/scan.html?mode=screen`);
    await scan.locator('#screen').click();
    await expect(scan.locator('.qr-card')).toHaveAttribute('data-verdict', 'clear', { timeout: 15_000 });
    await expect(scan.locator('.qr-verdict-domain')).toHaveText('example.com');
    await expect(scan.locator('#live')).toBeHidden();
    await expect.poll(() => history(sw)).toEqual(['https://example.com/']);
  });
});
