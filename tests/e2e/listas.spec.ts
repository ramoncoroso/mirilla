// Fase 4 · 4.0 «Listas públicas»: la extensión descarga la lista firmada, la comprueba y compara en local.
// Se sirve una lista firmada con la clave de pruebas (la build E2E confía en ella); el test no sale a la red.

import { readFileSync } from 'node:fs';
import type { BrowserContext, Page } from '@playwright/test';
import { domainKey, HASH_BYTES, hashKey, packHashes, sha256Hex, urlKey, type BlocklistMeta } from '../../lib/blocklist';
import { callMenu, expect, fixture, openPage, ORIGIN, tabIdOf, test } from './setup';

declare const chrome: any;

const BASE = 'https://ramoncoroso.github.io/mirilla/blocklist/';
const KEY = JSON.parse(readFileSync('tests/e2e/blocklist-key.json', 'utf8')) as { privateKey: string; publicKey: string };

/** Lista con esos dominios enteros y esas URLs exactas, firmada con la clave de pruebas (o con otra, si `forge`). */
async function makeList(domains: string[], urls: string[], { forge = false } = {}) {
  const d = packHashes(await Promise.all(domains.map((x) => hashKey(domainKey(x)!))));
  const u = packHashes(await Promise.all(urls.map((x) => hashKey(urlKey(x)!))));
  const bin = new Uint8Array(d.length + u.length);
  bin.set(d);
  bin.set(u, d.length);
  const meta: BlocklistMeta = {
    version: 1,
    generated: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    sha256: await sha256Hex(bin),
    hashBytes: HASH_BYTES,
    domains: d.length / HASH_BYTES,
    urls: u.length / HASH_BYTES,
    sources: [{ name: 'Phishing.Database', url: 'https://github.com/Phishing-Database/Phishing.Database', license: 'MIT' }],
  };
  const metaBytes = new TextEncoder().encode(JSON.stringify(meta));
  const key = forge
    ? (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])).privateKey
    : await crypto.subtle.importKey('pkcs8', Buffer.from(KEY.privateKey, 'base64'), { name: 'Ed25519' }, false, ['sign']);
  const sig = Buffer.from(await crypto.subtle.sign({ name: 'Ed25519' }, key, metaBytes)).toString('base64');
  return { 'meta.json': Buffer.from(metaBytes), 'meta.sig': Buffer.from(sig), 'blocklist.bin': Buffer.from(bin) } as Record<string, Buffer>;
}

async function serveList(context: BrowserContext, files: Record<string, Buffer>) {
  await context.unroute(`${BASE}**`);
  await context.route(`${BASE}**`, (route) => {
    const body = files[new URL(route.request().url()).pathname.split('/').pop()!];
    return body ? route.fulfill({ body, headers: { 'access-control-allow-origin': '*' } }) : route.fulfill({ status: 404 });
  });
}

/** Desde los ajustes: desactivar y volver a activar fuerza la descarga ya. */
async function refreshFromOptions(context: BrowserContext, extId: string): Promise<Page> {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extId}/options.html`);
  const box = options.locator('#blocklist-enabled');
  await expect(box).toBeChecked();
  await box.uncheck();
  await box.check();
  return options;
}

test('descarga la lista firmada y un enlace de la lista sale en Peligro, con su fuente y su edad', async ({ context, extId }) => {
  await serveList(context, await makeList(['example.com'], []));
  const options = await refreshFromOptions(context, extId);
  await expect(options.locator('#blocklist-status')).toContainText('1 entries');

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.setInputFiles('#file', fixture('qr-safe.png'));
  await expect(popup.locator('.qr-card')).toHaveAttribute('data-verdict', 'danger');
  await expect(popup.locator('.qr-danger').first()).toHaveText(
    'It is on a public phishing list (Phishing.Database, updated 3 h ago). Do not open it or enter any data.',
  );
  // Lo que no está en la lista no cambia.
  await popup.setInputFiles('#file', fixture('qr-trusted.png'));
  await expect(popup.locator('.qr-danger')).toHaveCount(0);
});

test('una URL exacta solo marca esa URL, no el dominio entero', async ({ context, extId }) => {
  await serveList(context, await makeList([], ['https://example.com/otra-ruta']));
  await refreshFromOptions(context, extId);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.setInputFiles('#file', fixture('qr-safe.png'));
  await expect(popup.locator('.qr-card')).not.toHaveAttribute('data-verdict', 'danger');
});

test('una lista con la firma falsa se descarta', async ({ context, extId }) => {
  await serveList(context, await makeList(['example.com'], [], { forge: true }));
  const options = await refreshFromOptions(context, extId);
  await expect(options.locator('#blocklist-status')).toHaveText('The list has not been downloaded yet.');
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.setInputFiles('#file', fixture('qr-safe.png'));
  await expect(popup.locator('.qr-card')).toHaveAttribute('data-verdict', 'clear');
});

test('desactivada: no se usa ni se guarda', async ({ context, extId }) => {
  await serveList(context, await makeList(['example.com'], []));
  const options = await refreshFromOptions(context, extId);
  await expect(options.locator('#blocklist-status')).toContainText('entries');
  await options.locator('#blocklist-enabled').uncheck();
  await expect(options.locator('#blocklist-status')).toHaveText('');
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.setInputFiles('#file', fixture('qr-safe.png'));
  await expect(popup.locator('.qr-card')).toHaveAttribute('data-verdict', 'clear');
});

test('panel en la página e icono: el background también compara con la lista', async ({ context, extId, sw, pages }) => {
  await serveList(context, await makeList(['example.com'], []));
  await refreshFromOptions(context, extId);
  const page = await openPage(context, pages, '/lista', `<img src="/fixtures/qr-safe.png" style="position:absolute;left:40px;top:40px">`);
  const tabId = await tabIdOf(sw, page);
  await callMenu(sw, 'readImage', tabId, `${ORIGIN}/fixtures/qr-safe.png`);
  await expect(page.locator('mirilla-ui .qr-card')).toHaveAttribute('data-verdict', 'danger');
  await expect(page.locator('mirilla-ui .qr-danger').first()).toContainText('public phishing list');
  await expect.poll(() => sw.evaluate((tabId) => chrome.action.getBadgeText({ tabId }), tabId)).toBe('!');
});

test('primera ejecución: el popup explica la lista hasta que se cierra el aviso', async ({ context, extId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await expect(popup.locator('#notice')).toBeVisible();
  await expect(popup.locator('#notice')).toContainText('compares on your device');
  await popup.getByRole('button', { name: 'Got it' }).click();
  await expect(popup.locator('#notice')).toBeHidden();
  await popup.reload();
  await expect(popup.locator('#scan')).toBeVisible();
  await expect(popup.locator('#notice')).toBeHidden();
});
