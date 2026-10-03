// Fase 4 · 4.3 «Tipos»: evento de calendario (VEVENT), 2FA (otpauth://) y pagos con criptomonedas (bitcoin:).

import type { BrowserContext } from '@playwright/test';
import { expect, fixture, test } from './setup';

async function popupWith(context: BrowserContext, extId: string, file: string) {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.setViewportSize({ width: 360, height: 640 });
  await popup.setInputFiles('#file', fixture(file));
  await expect(popup.locator('.qr-card')).toHaveCount(1);
  return popup;
}

/** Valor de la fila cuya etiqueta es `label` en la lista de datos. */
const row = (popup: Awaited<ReturnType<typeof popupWith>>, label: string) =>
  popup.locator('.qr-dl dt', { hasText: label }).locator('xpath=following-sibling::dd[1]');

test('evento: título, lugar, hora con zona, enlace incrustado y «Añadir al calendario» descarga un .ics', async ({ context, extId }) => {
  const popup = await popupWith(context, extId, 'qr-event.png');
  await expect(popup.locator('.qr-kind')).toHaveText('Calendar event');
  await expect(row(popup, 'Title')).toHaveText('Reunión de equipo');
  await expect(row(popup, 'Place')).toHaveText('Sala 2');
  await expect(row(popup, 'Starts')).toContainText('10:00');
  await expect(row(popup, 'Starts')).toContainText('Europe/Madrid');

  // El enlace de la descripción aparece en la sección de enlaces incrustados.
  await expect(popup.locator('.qr-embedded')).toContainText('example.com');

  const addToCalendar = popup.getByRole('link', { name: 'Add to calendar' });
  await expect(addToCalendar).toBeVisible();
  await expect(addToCalendar).toHaveAttribute('download', /\.ics$/);

  const [download] = await Promise.all([popup.waitForEvent('download'), addToCalendar.click()]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk as Buffer);
  const content = Buffer.concat(chunks).toString('utf8');
  expect(content).toContain('BEGIN:VCALENDAR');
  expect(content).toContain('SUMMARY:Reunión de equipo');
});

test('2FA: servicio y cuenta visibles, clave secreta oculta hasta pulsar «Show»/«Hide», Precaución y sin botón «Open»', async ({ context, extId }) => {
  const popup = await popupWith(context, extId, 'qr-otp.png');
  await expect(popup.locator('.qr-kind')).toHaveText('Two-factor authentication (2FA)');
  await expect(row(popup, 'Service')).toHaveText('Ejemplo');
  await expect(row(popup, 'Account')).toContainText('ana@example.com');

  await expect(popup.locator('.qr-card')).not.toContainText('JBSWY3DPEHPK3PXP');
  // El nombre accesible cambia con el botón (Show/Hide — Secret key).
  await popup.getByRole('button', { name: 'Show — Secret key' }).click();
  await expect(popup.locator('.qr-secret-value')).toHaveText('JBSWY3DPEHPK3PXP');
  await popup.getByRole('button', { name: 'Hide — Secret key' }).click();
  await expect(popup.locator('.qr-card')).not.toContainText('JBSWY3DPEHPK3PXP');
  await expect(popup.getByRole('button', { name: 'Show — Secret key' })).toBeVisible();
  // Copiar el contenido copiaría la clave: no se ofrece.
  await expect(popup.getByRole('button', { name: 'Copy content' })).toHaveCount(0);

  const card = popup.locator('.qr-card');
  await expect(card).toHaveAttribute('data-verdict', 'caution');
  await expect(card).toContainText(
    'Only scan a 2FA code from the security settings of your own account. A 2FA code given to you by someone else can link your account to an attacker.',
  );
  await expect(popup.getByRole('button', { name: 'Open', exact: true })).toHaveCount(0);

  await popup.screenshot({ path: 'test-results/tipos-otp.png' });
});

test('bitcoin: dirección, importe, concepto, aviso de irreversibilidad y «Copy address», sin Peligro', async ({ context, extId }) => {
  const popup = await popupWith(context, extId, 'qr-bitcoin.png');
  await expect(popup.locator('.qr-kind')).toHaveText('Crypto payment');
  await expect(row(popup, 'Address')).toHaveText('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2');
  await expect(row(popup, 'Amount')).toHaveText('0.01 BTC');
  await expect(row(popup, 'Label')).toHaveText('Donativo');
  await expect(popup.locator('.qr-warn')).toContainText('Crypto payments cannot be undone');
  await expect(popup.getByRole('button', { name: 'Copy address' })).toBeVisible();
  await expect(popup.locator('.qr-card')).not.toHaveAttribute('data-verdict', 'danger');
});

test('bitcoin con dirección inválida: Peligro, aviso de checksum y sin botón de copiar', async ({ context, extId }) => {
  const popup = await popupWith(context, extId, 'qr-bitcoin-bad.png');
  const card = popup.locator('.qr-card');
  await expect(card).toHaveAttribute('data-verdict', 'danger');
  await expect(card).toContainText('The Bitcoin address is not valid (its checksum is wrong): do not send anything to it.');
  await expect(popup.getByRole('button', { name: 'Copy address' })).toHaveCount(0);
});

test.describe('en castellano', () => {
  test.use({ lang: 'es' });

  test('2FA y evento con los textos en castellano', async ({ context, extId }) => {
    const otp = await popupWith(context, extId, 'qr-otp.png');
    await expect(otp.locator('.qr-kind')).toHaveText('Verificación en dos pasos (2FA)');
    await expect(otp.getByRole('button', { name: 'Mostrar' })).toBeVisible();

    const event = await popupWith(context, extId, 'qr-event.png');
    await expect(event.getByRole('link', { name: 'Añadir al calendario' })).toBeVisible();
  });
});
