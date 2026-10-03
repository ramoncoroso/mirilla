// Fase 4 · 4.0 «Avisar mejor»: veredicto único arriba, notas plegadas, fricción proporcional e icono por veredicto.

import { readFileSync } from 'node:fs';
import { callMenu, expect, fixture, openPage, ORIGIN, tabIdOf, test } from './setup';

declare const chrome: any;

test('sin señales: nunca «seguro», el dominio en grande y la pregunta; las notas, plegadas', async ({ context, extId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.setInputFiles('#file', fixture('qr-safe.png'));

  const verdict = popup.locator('.qr-verdict');
  await expect(verdict).toHaveClass(/qr-verdict-clear/);
  await expect(verdict.locator('.qr-verdict-label')).toHaveText('No risk signals');
  await expect(verdict.locator('.qr-verdict-domain')).toHaveText('example.com');
  await expect(verdict).toContainText('You are going to example.com. Is that the site you expected?');
  await expect(verdict).toContainText('Mirilla checks the address, not the page.');
  await expect(popup.locator('.qr-card')).not.toContainText(/\bsafe\b/i);

  // «Nunca habías leído…» es una nota: plegada hasta que se pide.
  const more = popup.locator('.qr-more');
  await expect(more.locator('summary')).toHaveText('More details (1)');
  const note = popup.getByText('Mirilla has never read a link to this domain before.');
  await expect(note).toBeHidden();
  await more.locator('summary').click();
  await expect(note).toBeVisible();

  await expect(popup.getByRole('button', { name: 'Open', exact: true })).toHaveClass(/qr-btn-primary/);
  await popup.setViewportSize({ width: 360, height: 520 });
  await popup.screenshot({ path: 'test-results/veredicto-sin-senales.png' });
});

test('Precaución: icono y etiqueta, y «Abrir» sin destacar', async ({ context, extId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.setInputFiles('#file', fixture('qr-http.png'));

  const verdict = popup.locator('.qr-verdict');
  await expect(verdict).toHaveClass(/qr-verdict-caution/);
  await expect(verdict.locator('.qr-verdict-icon')).toHaveText('⚠️');
  await expect(verdict.locator('.qr-verdict-label')).toHaveText('Caution');
  await expect(popup.locator('.qr-warn')).toBeVisible();
  const open = popup.getByRole('button', { name: 'Open', exact: true });
  await expect(open).toBeVisible();
  await expect(open).not.toHaveClass(/qr-btn-primary|qr-btn-danger/);
});

test('Peligro: «Abrir de todos modos» pide una segunda pulsación y ofrece copiar el enlace', async ({ context, extId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.setInputFiles('#file', fixture('qr-url.png'));

  await expect(popup.locator('.qr-verdict')).toHaveClass(/qr-verdict-danger/);
  await expect(popup.locator('.qr-verdict-label')).toHaveText('Danger');
  await expect(popup.getByRole('button', { name: 'Copy link' })).toBeVisible();

  await context.route((url) => url.hostname === 'evil.example', (route) => route.fulfill({ contentType: 'text/html', body: 'evil' }));
  const open = popup.getByRole('button', { name: 'Open anyway' });
  const pagesBefore = context.pages().length;
  await open.click();
  await expect(popup.getByRole('button', { name: 'Click again to open' })).toBeVisible();
  await popup.waitForTimeout(300);
  expect(context.pages().length).toBe(pagesBefore);

  const [opened] = await Promise.all([context.waitForEvent('page'), popup.getByRole('button', { name: 'Click again to open' }).click()]);
  await opened.waitForURL(/evil\.example/);
  await expect(popup.getByRole('button', { name: 'Open anyway' })).toBeVisible();
});

test('icono de la extensión: «!» amarillo para Precaución y rojo para Peligro', async ({ context, sw, pages }) => {
  const page = await openPage(context, pages, '/badge', `
    <img src="/fixtures/qr-http.png" style="position:absolute;left:40px;top:40px">
    <img src="/fixtures/qr-url.png" style="position:absolute;left:40px;top:400px">`);
  const tabId = await tabIdOf(sw, page);
  const badge = () =>
    sw.evaluate(async (tabId) => ({ text: await chrome.action.getBadgeText({ tabId }), bg: await chrome.action.getBadgeBackgroundColor({ tabId }) }), tabId);

  await callMenu(sw, 'readImage', tabId, `${ORIGIN}/fixtures/qr-http.png`);
  await expect(page.locator('mirilla-ui .qr-verdict-caution')).toBeVisible();
  await expect.poll(badge).toEqual({ text: '!', bg: [249, 171, 0, 255] });

  await callMenu(sw, 'readImage', tabId, `${ORIGIN}/fixtures/qr-url.png`);
  await expect.poll(badge).toEqual({ text: '!', bg: [217, 48, 37, 255] });

  await callMenu(sw, 'readImage', tabId, `data:image/png;base64,${readFileSync(fixture('qr-wifi.png')).toString('base64')}`);
  await expect.poll(async () => (await badge()).text).toBe('');
});

test.describe('en castellano', () => {
  test.use({ lang: 'es' });

  test('veredicto traducido', async ({ context, extId }) => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await popup.setInputFiles('#file', fixture('qr-safe.png'));
    await expect(popup.locator('.qr-verdict')).toContainText('Vas a example.com. ¿Es el sitio que esperabas?');
    await popup.setInputFiles('#file', fixture('qr-url.png'));
    await expect(popup.locator('.qr-verdict-label')).toHaveText('Peligro');
    await expect(popup.getByRole('button', { name: 'Copiar el enlace' })).toBeVisible();
  });
});
