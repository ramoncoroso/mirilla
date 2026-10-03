// Fase 4 · 4.0 «Investigar más»: antigüedad del dominio por RDAP, solo a petición. Las respuestas de IANA y del
// registro se simulan: el test no sale a la red.

import type { BrowserContext } from '@playwright/test';
import { callMenu, expect, fixture, openPage, ORIGIN, tabIdOf, test } from './setup';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

/** Simula IANA y el registro de .com; devuelve las peticiones hechas al registro. */
async function fakeRdap(context: BrowserContext, registered: string | null) {
  const asked: string[] = [];
  await context.route('https://data.iana.org/rdap/dns.json', (route) =>
    route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ services: [[['com'], ['https://rdap.registro.test/com/v1/']]] }) }),
  );
  await context.route('https://rdap.registro.test/**', (route) => {
    asked.push(route.request().url());
    const body = registered ? { events: [{ eventAction: 'registration', eventDate: registered }] } : {};
    return route.fulfill({ contentType: 'application/rdap+json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  });
  return asked;
}

test('nada se consulta hasta pulsar; luego, la fecha de registro', async ({ context, extId }) => {
  const asked = await fakeRdap(context, '1995-08-14T04:00:00Z');
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.setInputFiles('#file', fixture('qr-safe.png'));

  // Explica antes a quién se pregunta y qué ve.
  await expect(popup.locator('.qr-investigate')).toContainText('Asks the public domain registry (RDAP) when example.com was registered');
  expect(asked).toEqual([]);

  await popup.getByRole('button', { name: 'Investigate further' }).click();
  await expect(popup.locator('.qr-domain-age')).toContainText('Registered on Aug 14, 1995');
  // Solo el dominio, nunca la URL completa.
  expect(asked).toEqual(['https://rdap.registro.test/com/v1/domain/example.com']);
  await expect(popup.getByRole('button', { name: 'Investigate further' })).toHaveCount(0);
});

test('un dominio de pocos días se avisa', async ({ context, extId }) => {
  await fakeRdap(context, daysAgo(3));
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.setInputFiles('#file', fixture('qr-safe.png'));
  await popup.getByRole('button', { name: 'Investigate further' }).click();
  await expect(popup.locator('.qr-domain-new')).toContainText('Registered only 3 days ago');
  // El veredicto sube a Precaución y «Open» deja de ir destacado.
  await expect(popup.locator('.qr-card')).toHaveAttribute('data-verdict', 'caution');
  await expect(popup.locator('.qr-verdict-label')).toHaveText('Caution');
  await expect(popup.getByRole('button', { name: 'Open', exact: true })).not.toHaveClass(/qr-btn-primary/);
  await popup.setViewportSize({ width: 360, height: 600 });
  await popup.screenshot({ path: 'test-results/investigar-nuevo.png' });
});

test('sin fecha en el registro: lo dice', async ({ context, extId }) => {
  await fakeRdap(context, null);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.setInputFiles('#file', fixture('qr-safe.png'));
  await popup.getByRole('button', { name: 'Investigate further' }).click();
  await expect(popup.locator('.qr-investigate-result')).toHaveText('The registry for this domain does not publish its registration date.');
});

test('no se ofrece en un sitio de confianza ni en contenido que no es una web', async ({ context, extId }) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extId}/options.html`);
  await options.locator('#trusted-input').fill('mibancolocal.es');
  await options.getByRole('button', { name: 'Add', exact: true }).click();
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.setInputFiles('#file', fixture('qr-trusted.png'));
  await expect(popup.locator('.qr-card')).toHaveAttribute('data-verdict', 'trusted');
  await expect(popup.locator('.qr-investigate')).toHaveCount(0);
  await popup.setInputFiles('#file', fixture('qr-wifi.png'));
  await expect(popup.locator('.qr-investigate')).toHaveCount(0);
});

test('panel en la página: la consulta la hace el background', async ({ context, sw, pages }) => {
  await fakeRdap(context, daysAgo(10));
  const page = await openPage(context, pages, '/rdap', `<img src="/fixtures/qr-safe.png" style="position:absolute;left:40px;top:40px">`);
  await callMenu(sw, 'readImage', await tabIdOf(sw, page), `${ORIGIN}/fixtures/qr-safe.png`);
  await page.locator('mirilla-ui').getByRole('button', { name: 'Investigate further' }).click();
  await expect(page.locator('mirilla-ui .qr-domain-new')).toContainText('Registered only 10 days ago');
});
