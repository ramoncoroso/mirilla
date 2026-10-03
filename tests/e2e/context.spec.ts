// Fase 4 · 4.0: sitios de confianza (página de ajustes) y familiaridad, en el popup y en el panel de la página.

import type { BrowserContext, Page } from '@playwright/test';
import { callMenu, expect, fixture, history, openPage, ORIGIN, tabIdOf, test } from './setup';

declare const chrome: any;

async function openOptions(context: BrowserContext, extId: string): Promise<Page> {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extId}/options.html`);
  return options;
}

async function addTrusted(options: Page, site: string) {
  await options.locator('#trusted-input').fill(site);
  await options.getByRole('button', { name: 'Add', exact: true }).click();
}

test('ajustes: añadir, normalizar, rechazar y quitar sitios de confianza', async ({ context, extId, sw }) => {
  const options = await openOptions(context, extId);
  await expect(options.locator('h1')).toHaveText('Mirilla settings');
  await expect(options.locator('#trusted-list')).toHaveText('You have not added any trusted sites yet.');

  // Se guarda el dominio registrable, venga como venga.
  await addTrusted(options, 'https://www.MiBancoLocal.es/login?x=1');
  await expect(options.locator('#trusted-status')).toHaveText('mibancolocal.es added.');
  await expect(options.locator('#trusted-list .site')).toHaveText(['mibancolocal.es']);
  await expect(options.locator('#trusted-input')).toHaveValue('');

  await addTrusted(options, 'no es una web');
  await expect(options.locator('#trusted-status')).toContainText('That is not a website domain');
  await addTrusted(options, 'mibancolocal.es');
  await expect(options.locator('#trusted-list .site')).toHaveCount(1);

  await options.reload();
  await expect(options.locator('#trusted-list .site')).toHaveText(['mibancolocal.es']);
  expect(await sw.evaluate(async () => (await chrome.storage.local.get('trustedSites')).trustedSites)).toEqual(['mibancolocal.es']);

  await options.getByRole('button', { name: 'Remove mibancolocal.es' }).click();
  await expect(options.locator('#trusted-list .site')).toHaveCount(0);
  await options.screenshot({ path: 'test-results/ajustes.png' });
});

test('el popup abre los ajustes', async ({ context, extId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  const [options] = await Promise.all([context.waitForEvent('page'), popup.locator('#settings').click()]);
  await expect(options).toHaveURL(`chrome-extension://${extId}/options.html`);
});

test('popup: un sitio de confianza sale ✅ y su imitación ⛔', async ({ context, extId }) => {
  await addTrusted(await openOptions(context, extId), 'mibancolocal.es');
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);

  await popup.setInputFiles('#file', fixture('qr-trusted.png'));
  await expect(popup.locator('.qr-card')).toHaveAttribute('data-verdict', 'trusted');
  await expect(popup.locator('.qr-card')).toContainText('mibancolocal.es is one of your trusted sites.');

  await popup.setInputFiles('#file', fixture('qr-imita.png'));
  await expect(popup.locator('.qr-card')).toHaveAttribute('data-verdict', 'danger');
  await expect(popup.locator('.qr-danger')).toContainText('one of your trusted sites');
  await expect(popup.getByRole('button', { name: 'Open anyway' })).toBeVisible();
});

test('popup: familiaridad con el historial, y nota si está desactivado', async ({ context, extId, sw }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  const firstVisit = popup.getByText('Mirilla has never read a link to this domain before.');

  // Primera vez: el contexto se carga antes de guardar la lectura.
  await popup.setInputFiles('#file', fixture('qr-safe.png'));
  await expect(firstVisit).toBeAttached(); // nota plegada en «More details»
  await expect.poll(() => history(sw)).toEqual(['https://example.com/']);

  // Segunda vez: ya conocido.
  await popup.setInputFiles('#file', fixture('qr-wifi.png'));
  await popup.setInputFiles('#file', fixture('qr-safe.png'));
  await expect(popup.locator('.qr-card')).toHaveAttribute('data-verdict', 'clear');
  await expect(firstVisit).toHaveCount(0);

  // Sin historial, la señal no está disponible y se dice.
  await popup.locator('summary').click();
  await popup.locator('#history-enabled').uncheck();
  await popup.setInputFiles('#file', fixture('qr-safe.png'));
  await expect(popup.getByText('With history turned off, Mirilla cannot tell')).toBeAttached();
  await expect(popup.locator('.qr-card')).toHaveAttribute('data-verdict', 'clear');
});

test('panel en la página: el background manda el contexto (confianza e imitación)', async ({ context, extId, sw, pages }) => {
  await addTrusted(await openOptions(context, extId), 'mibancolocal.es');
  const page = await openPage(context, pages, '/confianza', `
    <img id="ok" src="/fixtures/qr-trusted.png" style="position:absolute;left:40px;top:40px">
    <img id="bad" src="/fixtures/qr-imita.png" style="position:absolute;left:40px;top:400px">`);
  const tabId = await tabIdOf(sw, page);

  await callMenu(sw, 'readImage', tabId, `${ORIGIN}/fixtures/qr-trusted.png`);
  const card = page.locator('mirilla-ui .qr-card');
  await expect(card).toHaveAttribute('data-verdict', 'trusted');
  await expect(card).toContainText('one of your trusted sites');

  await callMenu(sw, 'readImage', tabId, `${ORIGIN}/fixtures/qr-imita.png`);
  await expect(card).toHaveAttribute('data-verdict', 'danger');
  // El icono de la extensión también usa el contexto.
  await expect.poll(() => sw.evaluate((tabId) => chrome.action.getBadgeText({ tabId }), tabId)).toBe('!');
  await page.screenshot({ path: 'test-results/panel-imita-confianza.png' });
});
