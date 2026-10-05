// Fase 4 · 4.4 «Página»: el generador de create.html, un formulario por tipo de contenido con vista previa,
// comprobación de lectura (se vuelve a leer el propio canvas) y descargas de PNG/SVG.

import type { BrowserContext, Download, Page, Worker } from '@playwright/test';
import { expect, test } from './setup';

declare const chrome: any;

const VERIFIED_EN = 'Checked: it reads correctly ✓';
const VERIFIED_ES = 'Comprobado: se lee bien ✓';

async function openCreate(context: BrowserContext, extId: string, query = ''): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extId}/create.html${query}`);
  return page;
}

/** Estado que la página deja en storage (solo en la build E2E): el mismo que usa el puente de Firefox. */
async function createState(sw: Worker): Promise<{ state: string; text: string | null } | null> {
  return sw.evaluate(async () => (await chrome.storage.local.get('e2eCreateState')).e2eCreateState ?? null);
}

async function readDownload(download: Download): Promise<string> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

interface KindCase {
  kind: string;
  name: string;
  fill: (page: Page) => Promise<void>;
  /** Comienzo exacto del contenido codificado. */
  prefix: string;
  /** Otros fragmentos que debe contener (además del comienzo). */
  contains?: string[];
  /** Nombre de fichero esperado al descargar el SVG. */
  svgName: string;
  screenshot?: boolean;
}

const KIND_CASES: KindCase[] = [
  {
    kind: 'url',
    name: 'url: dirección web completa',
    fill: (page) => page.locator('#f-url').fill('https://ejemplo.test/producto?x=1'),
    prefix: 'https://ejemplo.test/producto?x=1',
    svgName: 'qr-ejemplo.test.svg',
    screenshot: true,
  },
  {
    kind: 'text',
    name: 'text: texto libre, tal cual',
    fill: (page) => page.locator('#f-text').fill('Texto de prueba con tildes: ñ é'),
    prefix: 'Texto de prueba con tildes: ñ é',
    svgName: 'qr-text.svg',
  },
  {
    kind: 'wifi',
    name: 'wifi: sin contraseña al elegir «Ninguna» y con nota al elegir WPA',
    fill: async (page) => {
      await page.locator('#f-ssid').fill('CasaWifi');
      await page.locator('#f-security').selectOption('nopass');
      await expect(page.locator('#f-password')).toHaveCount(0);
      await page.locator('#f-security').selectOption('WPA');
      await expect(page.locator('#f-password')).toBeVisible();
      await expect(page.locator('#fields')).toContainText('Anyone who scans it will see the password.');
      await page.locator('#f-password').fill('clave12345');
    },
    prefix: 'WIFI:T:WPA;S:CasaWifi;P:clave12345;;',
    svgName: 'qr-wifi.svg',
    screenshot: true,
  },
  {
    kind: 'contact',
    name: 'contact: vCard con nombre, empresa y datos de contacto',
    fill: async (page) => {
      await page.locator('#f-firstName').fill('Ana');
      await page.locator('#f-lastName').fill('Pérez');
      await page.locator('#f-org').fill('Acme');
      await page.locator('#f-title').fill('Directora');
      await page.locator('#f-phone').fill('+34600111222');
      await page.locator('#f-email').fill('ana@acme.test');
      await page.locator('#f-url').fill('https://acme.test');
      await page.locator('#f-address').fill('Calle Mayor 1');
      await page.locator('#f-note').fill('Nota de prueba');
    },
    prefix: 'BEGIN:VCARD',
    contains: ['FN:Ana Pérez', 'ORG:Acme', 'TEL:+34600111222', 'EMAIL:ana@acme.test', 'END:VCARD'],
    svgName: 'qr-contact.svg',
  },
  {
    kind: 'email',
    name: 'email: mailto con asunto y cuerpo codificados',
    fill: async (page) => {
      await page.locator('#f-to').fill('destino@test.com');
      await page.locator('#f-subject').fill('Asunto');
      await page.locator('#f-body').fill('Cuerpo del mensaje');
    },
    prefix: 'mailto:destino@test.com',
    contains: ['subject=Asunto', 'body=Cuerpo%20del%20mensaje'],
    svgName: 'qr-email.svg',
  },
  {
    kind: 'tel',
    name: 'tel: número de teléfono',
    fill: (page) => page.locator('#f-number').fill('+34911222333'),
    prefix: 'tel:+34911222333',
    svgName: 'qr-tel.svg',
  },
  {
    kind: 'sms',
    name: 'sms: número y mensaje (SMSTO)',
    fill: async (page) => {
      await page.locator('#f-number').fill('+34911222333');
      await page.locator('#f-body').fill('Hola');
    },
    prefix: 'SMSTO:+34911222333:Hola',
    svgName: 'qr-sms.svg',
  },
  {
    kind: 'geo',
    name: 'geo: coordenadas con nombre de lugar',
    fill: async (page) => {
      await page.locator('#f-lat').fill('40.4168');
      await page.locator('#f-lon').fill('-3.7038');
      await page.locator('#f-query').fill('Madrid');
    },
    prefix: 'geo:40.4168,-3.7038?q=Madrid',
    svgName: 'qr-geo.svg',
  },
  {
    kind: 'event',
    name: 'event: al marcar «Todo el día» #f-start pasa a type=date conservando el día',
    fill: async (page) => {
      await page.locator('#f-title').fill('Reunión');
      await page.locator('#f-start').fill('2026-03-15T10:30');
      await expect(page.locator('#f-start')).toHaveAttribute('type', 'datetime-local');
      await page.locator('#f-allDay').check();
      await expect(page.locator('#f-start')).toHaveAttribute('type', 'date');
      await expect(page.locator('#f-start')).toHaveValue('2026-03-15');
      await page.locator('#f-end').fill('2026-03-17');
    },
    prefix: 'BEGIN:VEVENT',
    contains: ['SUMMARY:Reunión', 'DTSTART;VALUE=DATE:20260315', 'DTEND;VALUE=DATE:20260318', 'END:VEVENT'],
    svgName: 'qr-event.svg',
  },
  {
    kind: 'sepa',
    name: 'sepa: pago EPC con IBAN válido, importe y referencia',
    fill: async (page) => {
      await page.locator('#f-name').fill('Juan García');
      await page.locator('#f-iban').fill('ES9121000418450200051332');
      await page.locator('#f-amount').fill('12.50');
      await page.locator('#f-reference').fill('Factura 42');
    },
    prefix: 'BCD\n002',
    contains: ['SCT', 'Juan García', 'ES9121000418450200051332', 'EUR12.50', 'Factura 42'],
    svgName: 'qr-sepa.svg',
    screenshot: true,
  },
];

for (const c of KIND_CASES) {
  test(c.name, async ({ context, extId, sw }) => {
    const page = await openCreate(context, extId);
    await page.locator('#kind').selectOption(c.kind);
    await c.fill(page);
    await expect(page.locator('#check')).toHaveText(VERIFIED_EN, { timeout: 10_000 });

    const content = await page.locator('#content').textContent();
    expect(content).not.toBeNull();
    expect(content!.startsWith(c.prefix)).toBe(true);
    for (const needle of c.contains ?? []) expect(content).toContain(needle);

    // El propio canvas se volvió a leer con el lector de Mirilla antes de marcar «Comprobado»: aquí se confirma
    // que lo que queda en storage (lo que usa el puente de Firefox) es ese mismo texto comprobado.
    const state = await createState(sw);
    expect(state?.state).toBe('ok');
    expect(state?.text).toBe(content);

    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#svg').click()]);
    expect(download.suggestedFilename()).toBe(c.svgName);
    const svg = await readDownload(download);
    expect(svg.startsWith('<?xml')).toBe(true);
    expect(svg).toContain('<svg');
    expect(svg).toContain('<path');

    if (c.screenshot) {
      await page.setViewportSize({ width: 900, height: 700 });
      await page.screenshot({ path: `test-results/crear-${c.kind}.png` });
    }
  });
}

test('url con esquema no permitido: error, PNG deshabilitado y lienzo oculto', async ({ context, extId }) => {
  const page = await openCreate(context, extId);
  await page.locator('#f-url').fill('javascript:alert(1)');
  await expect(page.locator('#f-url-error')).toBeVisible();
  await expect(page.locator('#f-url-error')).toHaveText(/Only web addresses \(http or https\)/);
  await expect(page.locator('#png')).toBeDisabled();
  await expect(page.locator('#qr')).toBeHidden();
});

test('sepa: IBAN inválido muestra su propio error (no el genérico)', async ({ context, extId }) => {
  const page = await openCreate(context, extId);
  await page.locator('#kind').selectOption('sepa');
  await page.locator('#f-name').fill('Juan García');
  // Mismo IBAN que el válido, con el último dígito cambiado: el dígito de control ya no cuadra.
  await page.locator('#f-iban').fill('ES9121000418450200051333');
  await expect(page.locator('#f-iban-error')).toBeVisible();
  await expect(page.locator('#f-iban-error')).toHaveText('This IBAN is not valid (check the digits).');
});

test('«Required.» no aparece hasta tocar el campo (escribir y borrar lo muestra)', async ({ context, extId }) => {
  const page = await openCreate(context, extId);
  // Tipo «url» por defecto, sin rellenar: está vacío pero aún no se ha tocado, así que no avisa.
  await expect(page.locator('#f-url-error')).toBeHidden();
  await page.locator('#f-url').fill('x');
  await page.locator('#f-url').fill('');
  await expect(page.locator('#f-url-error')).toBeVisible();
  await expect(page.locator('#f-url-error')).toHaveText('Required.');
});

test('texto demasiado largo para un QR: aviso de acortar y botones deshabilitados', async ({ context, extId }) => {
  const page = await openCreate(context, extId);
  await page.locator('#kind').selectOption('text');
  // 3000 caracteres «é» (2 bytes en UTF-8 cada uno) son 6000 bytes: muy por encima de lo que cabe en nivel M.
  await page.locator('#f-text').fill('é'.repeat(3000));
  await expect(page.locator('#check')).toHaveText('Too much content for a QR code: shorten it.', { timeout: 10_000 });
  await expect(page.locator('#qr')).toBeHidden();
  await expect(page.locator('#png')).toBeDisabled();
  await expect(page.locator('#svg')).toBeDisabled();
  await expect(page.locator('#copy')).toBeDisabled();
});

test('SVG: contenido vectorial que no incrusta el texto del usuario', async ({ context, extId }) => {
  const page = await openCreate(context, extId);
  await page.locator('#kind').selectOption('text');
  await page.locator('#f-text').fill('Dato <script>alert(1)</script> fin');
  await expect(page.locator('#check')).toHaveText(VERIFIED_EN, { timeout: 10_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#svg').click()]);
  const svg = await readDownload(download);
  expect(svg).not.toContain('<script>');
  expect(svg).not.toContain('alert(1)');
});

test('«Copy image» cambia el texto del botón al copiar', async ({ context, extId }) => {
  // Se concede el permiso de portapapeles al contexto; si el navegador aun así lo deniega en este entorno,
  // la página ofrece "Couldn't copy" en vez de fallar, y el test también lo acepta.
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await openCreate(context, extId);
  await page.locator('#kind').selectOption('tel');
  await page.locator('#f-number').fill('+34911222333');
  await expect(page.locator('#check')).toHaveText(VERIFIED_EN, { timeout: 10_000 });
  await page.locator('#copy').click();
  await expect(page.locator('#copy')).toHaveText(/Copied ✓|Couldn't copy/);
});

test.describe('se rellena desde la query (?type=&campo=)', () => {
  test('abre ya con el tipo y el valor dados', async ({ context, extId }) => {
    const page = await openCreate(context, extId, '?type=tel&number=%2B34911222333');
    await expect(page.locator('#kind')).toHaveValue('tel');
    await expect(page.locator('#f-number')).toHaveValue('+34911222333');
    await expect(page.locator('#check')).toHaveText(VERIFIED_EN, { timeout: 10_000 });
  });
});

test.describe('en castellano', () => {
  test.use({ lang: 'es' });

  test('título y «Comprobado: se lee bien ✓» en castellano', async ({ context, extId }) => {
    const page = await openCreate(context, extId);
    await expect(page.locator('h1')).toHaveText('Crear un código QR');
    await page.locator('#kind').selectOption('tel');
    await page.locator('#f-number').fill('+34911222333');
    await expect(page.locator('#check')).toHaveText(VERIFIED_ES, { timeout: 10_000 });
  });
});
