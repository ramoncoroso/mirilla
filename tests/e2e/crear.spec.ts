// Fase 4 · 4.4 «Página»: el generador de create.html, un formulario por tipo de contenido con vista previa,
// comprobación de lectura (se vuelve a leer el propio canvas) y descargas de PNG/SVG.

import fs from 'node:fs';
import type { BrowserContext, Download, Page, Worker } from '@playwright/test';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import { expect, test } from './setup';

declare const chrome: any;

const VERIFIED_EN = 'Checked: it reads correctly ✓';
const VERIFIED_ES = 'Comprobado: se lee bien ✓';
const NOT_VERIFIED_EN = "It doesn't read back correctly, so it can't be downloaded. Change the colors or the logo.";
/** Fin de la comprobación, se lea bien o no (nunca «Comprobando que se lee…»). */
const SETTLED = /Checked: it reads correctly ✓|It doesn't read back correctly, so it can't be downloaded\. Change the colors or the logo\./;

async function openCreate(context: BrowserContext, extId: string, query = ''): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extId}/create.html${query}`);
  return page;
}

/** Estado que la página deja en storage (solo en la build E2E): el mismo que usa el puente de Firefox. */
async function createState(sw: Worker): Promise<{ state: string; text: string | null } | null> {
  return sw.evaluate(async () => (await chrome.storage.local.get('e2eCreateState')).e2eCreateState ?? null);
}

async function readDownloadBytes(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

async function readDownload(download: Download): Promise<string> {
  return (await readDownloadBytes(download)).toString('utf8');
}

/** Ancho y alto de un PNG mirando su cabecera IHDR (bytes 16-23), sin decodificar la imagen. */
function pngSize(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/** 'ok' o 'bad' según la clase que deja setCheck() en #check (nunca 'idle', una vez comprobado). */
async function checkState(page: Page): Promise<string> {
  const cls = (await page.locator('#check').getAttribute('class')) ?? '';
  return cls.includes('bad') ? 'bad' : cls.includes('ok') ? 'ok' : 'idle';
}

/** Un píxel del canvas de la vista previa (RGBA). */
async function canvasPixel(page: Page, x: number, y: number): Promise<number[]> {
  return page.evaluate(
    ({ x, y }) => {
      const c = document.querySelector('#qr') as HTMLCanvasElement;
      const ctx = c.getContext('2d')!;
      return Array.from(ctx.getImageData(x, y, 1, 1).data);
    },
    { x, y },
  );
}

/** Las opciones van en un <details> cerrado de inicio: hay que abrirlo antes de tocar nada de dentro. */
async function openOptions(page: Page) {
  const details = page.locator('#options');
  if (!(await details.evaluate((d: HTMLDetailsElement) => d.open))) await details.locator('summary').click();
}

/** Pone un valor en un <input type=range> (no admite locator.fill, a diferencia de type=color). */
async function setRange(page: Page, selector: string, value: string) {
  await page.locator(selector).evaluate((el, value) => {
    (el as HTMLInputElement).value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

/** Dibuja un círculo de color en un canvas y lo codifica como PNG/JPG/WebP: un logo mínimo generado aquí mismo. */
async function makeLogo(page: Page, mime: string, color = '#c23b3b'): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    ({ mime, color }) => {
      const c = document.createElement('canvas');
      c.width = 200;
      c.height = 200;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 200, 200);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(100, 100, 80, 0, Math.PI * 2);
      ctx.fill();
      return c.toDataURL(mime);
    },
    { mime, color },
  );
  return Buffer.from(dataUrl.split(',')[1]!, 'base64');
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

test.describe('opciones y logo', () => {
  // El lector de Mirilla (decodeImageData) no devuelve el nivel de corrección: para comprobarlo se lee el
  // PNG descargado con el lector real de zxing-wasm desde Node (igual que tests/qr-draw.test.ts), que sí
  // lo expone en ReadResult.ecLevel. readBarcodes acepta los bytes del PNG tal cual: no hace falta decodificarlo.
  test.beforeAll(async () => {
    await prepareZXingModule({
      overrides: { wasmBinary: fs.readFileSync('node_modules/zxing-wasm/dist/reader/zxing_reader.wasm') },
      fireImmediately: true,
    });
  });

  for (const level of ['L', 'H'] as const) {
    test(`nivel de corrección ${level}: el PNG descargado conserva ese nivel`, async ({ context, extId }) => {
      const page = await openCreate(context, extId);
      await openOptions(page);
      await page.locator('#f-url').fill('https://ejemplo.test/correccion');
      await page.locator('#ec').selectOption(level);
      await expect(page.locator('#check')).toHaveText(VERIFIED_EN, { timeout: 10_000 });
      const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#png').click()]);
      const png = await readDownloadBytes(download);
      const [result] = await readBarcodes(png, { formats: ['QRCode'] });
      expect(result?.ecLevel).toBe(level);
    });
  }

  test('tamaño 1024: #size-actual y el PNG descargado miden lo mismo, entre 900 y 1100 px', async ({ context, extId }) => {
    const page = await openCreate(context, extId);
    await openOptions(page);
    await page.locator('#f-url').fill('https://ejemplo.test/tamano');
    await page.locator('#size').fill('1024');
    await expect(page.locator('#check')).toHaveText(VERIFIED_EN, { timeout: 10_000 });
    const text = await page.locator('#size-actual').textContent();
    const n = Number(/(\d+)/.exec(text ?? '')?.[1]);
    expect(n).toBeGreaterThan(900);
    expect(n).toBeLessThan(1100);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#png').click()]);
    const { width, height } = pngSize(await readDownloadBytes(download));
    expect(width).toBe(n);
    expect(height).toBe(n);
  });

  test.describe('colores', () => {
    test('fg/bg válidos y con buen contraste: se lee, sin aviso, y el lienzo usa esos colores', async ({ context, extId }) => {
      const page = await openCreate(context, extId);
      await openOptions(page);
      await page.locator('#f-url').fill('https://ejemplo.test/colores-ok');
      await page.locator('#fg').fill('#1a237e');
      await page.locator('#bg').fill('#fff8e1');
      await expect(page.locator('#check')).toHaveText(VERIFIED_EN, { timeout: 10_000 });
      await expect(page.locator('#color-note')).toBeHidden();
      // Esquina (0,0): siempre margen, así que es el fondo.
      expect(await canvasPixel(page, 0, 0)).toEqual([0xff, 0xf8, 0xe1, 255]);
      const hasFg = await page.evaluate(() => {
        const c = document.querySelector('#qr') as HTMLCanvasElement;
        const ctx = c.getContext('2d')!;
        const data = ctx.getImageData(0, 0, c.width, c.height).data;
        for (let i = 0; i < data.length; i += 4) if (data[i] === 0x1a && data[i + 1] === 0x23 && data[i + 2] === 0x7e) return true;
        return false;
      });
      expect(hasFg).toBe(true);
    });

    test('fg claro sobre bg oscuro (invertidos): aviso de inversión y estado final (se lea o no)', async ({ context, extId }) => {
      const page = await openCreate(context, extId);
      await openOptions(page);
      await page.locator('#f-url').fill('https://ejemplo.test/colores-invertidos');
      await page.locator('#fg').fill('#ffffff');
      await page.locator('#bg').fill('#000000');
      await expect(page.locator('#color-note')).toBeVisible();
      await expect(page.locator('#color-note')).toHaveText("The code is lighter than the background: many readers, especially phone cameras, can't read it.");
      // Solo se comprueba que termina en un estado u otro, no cuál: un lector puede leer blanco sobre negro o no.
      await expect(page.locator('#check')).toHaveText(SETTLED, { timeout: 10_000 });
      expect(['ok', 'bad']).toContain(await checkState(page));
    });

    test('fg y bg con poco contraste: aviso de poco contraste', async ({ context, extId }) => {
      const page = await openCreate(context, extId);
      await openOptions(page);
      await page.locator('#f-url').fill('https://ejemplo.test/colores-poco-contraste');
      await page.locator('#fg').fill('#bbbbbb');
      await page.locator('#bg').fill('#ffffff');
      await expect(page.locator('#color-note')).toBeVisible();
      await expect(page.locator('#color-note')).toHaveText('Little contrast between the code and the background: it may fail in poor light or on screens.');
    });
  });

  test('margen 0: estado final (ok o bad); si es bad, los botones de descarga quedan deshabilitados', async ({ context, extId }) => {
    const page = await openCreate(context, extId);
    await openOptions(page);
    await page.locator('#f-url').fill('https://ejemplo.test/margen-0');
    await page.locator('#margin').fill('0');
    await expect(page.locator('#check')).toHaveText(SETTLED, { timeout: 10_000 });
    const state = await checkState(page);
    // Comportamiento observado: sin margen (zona tranquila), zxing-wasm sigue leyendo el canvas igual
    // (el margen solo afecta al aspecto, no a la detección en una imagen limpia), así que queda en 'ok'.
    // Se deja también la rama 'bad' por si cambiara con otro contenido: los botones deben deshabilitarse.
    if (state === 'bad') {
      await expect(page.locator('#png')).toBeDisabled();
      await expect(page.locator('#svg')).toBeDisabled();
      await expect(page.locator('#copy')).toBeDisabled();
    } else {
      expect(state).toBe('ok');
      await expect(page.locator('#png')).toBeEnabled();
    }
  });

  test.describe('logo', () => {
    test('subir un PNG: fuerza H, se lee, y el centro del lienzo tiene el color del logo (no solo blanco/negro)', async ({ context, extId }) => {
      const page = await openCreate(context, extId);
      await openOptions(page);
      await page.locator('#f-url').fill('https://ejemplo.test/logo-png-para-que-el-qr-sea-grande-de-sobra');
      await expect(page.locator('#check')).toHaveText(VERIFIED_EN, { timeout: 10_000 });
      await page.setInputFiles('#logo', { name: 'logo.png', mimeType: 'image/png', buffer: await makeLogo(page, 'image/png') });
      await expect(page.locator('#logo-note')).toBeVisible();
      await expect(page.locator('#ec')).toBeDisabled();
      await expect(page.locator('#ec')).toHaveValue('H');
      await expect(page.locator('#check')).toHaveText(VERIFIED_EN, { timeout: 10_000 });

      const side = await page.locator('#qr').evaluate((c: HTMLCanvasElement) => c.width);
      const center = await canvasPixel(page, Math.floor(side / 2), Math.floor(side / 2));
      expect(center.slice(0, 3)).not.toEqual([0, 0, 0]);
      expect(center.slice(0, 3)).not.toEqual([255, 255, 255]);

      // El SVG lleva el logo como <image> con un PNG en data: (nuestro, redibujado), nunca otro esquema.
      const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#svg').click()]);
      const svg = await readDownload(download);
      expect(svg).toContain('<image');
      const hrefs = [...svg.matchAll(/href="([^"]*)"/g)].map((m) => m[1]!);
      expect(hrefs.length).toBeGreaterThan(0);
      for (const href of hrefs) expect(href.startsWith('data:image/png;base64,')).toBe(true);

      // Tamaño de logo al máximo (30 %): comprobado, con este contenido y corrección H sigue leyéndose
      // ('ok'). Se deja también la rama 'bad' por si cambiara con otro contenido: debe ser coherente
      // (botones deshabilitados).
      await setRange(page, '#logo-size', '30');
      await expect(page.locator('#check')).toHaveText(SETTLED, { timeout: 10_000 });
      const stateAt30 = await checkState(page);
      if (stateAt30 === 'bad') {
        await expect(page.locator('#png')).toBeDisabled();
      } else {
        expect(stateAt30).toBe('ok');
        await expect(page.locator('#png')).toBeEnabled();
      }

      // Quitar el logo: #ec vuelve a habilitarse, la nota desaparece y el SVG ya no lleva <image>.
      await page.locator('#logo-remove').click();
      await expect(page.locator('#ec')).toBeEnabled();
      await expect(page.locator('#ec')).toHaveValue('M');
      await expect(page.locator('#logo-note')).toBeHidden();
      await expect(page.locator('#check')).toHaveText(VERIFIED_EN, { timeout: 10_000 });
      const [download2] = await Promise.all([page.waitForEvent('download'), page.locator('#svg').click()]);
      const svg2 = await readDownload(download2);
      expect(svg2).not.toContain('<image');
    });

    test('logo en JPG y en WebP: también se aceptan', async ({ context, extId }) => {
      const page = await openCreate(context, extId);
      await openOptions(page);
      await page.locator('#f-url').fill('https://ejemplo.test/logo-formatos');
      await expect(page.locator('#check')).toHaveText(VERIFIED_EN, { timeout: 10_000 });
      for (const [mime, ext] of [['image/jpeg', 'jpg'], ['image/webp', 'webp']] as const) {
        await page.setInputFiles('#logo', { name: `logo.${ext}`, mimeType: mime, buffer: await makeLogo(page, mime) });
        await expect(page.locator('#logo-error')).toBeHidden();
        await expect(page.locator('#logo-note')).toBeVisible();
        await expect(page.locator('#check')).toHaveText(VERIFIED_EN, { timeout: 10_000 });
        await page.locator('#logo-remove').click();
        await expect(page.locator('#check')).toHaveText(VERIFIED_EN, { timeout: 10_000 });
      }
    });

    test('rechazos: un SVG (aunque se llame .png y diga image/png), un texto cualquiera, y un fichero de más de 5 MB', async ({ context, extId }) => {
      const page = await openCreate(context, extId);
      await openOptions(page);
      await page.locator('#f-url').fill('https://ejemplo.test/logo-rechazos');
      await expect(page.locator('#check')).toHaveText(VERIFIED_EN, { timeout: 10_000 });

      // Un SVG es un documento (con su propio código), no una imagen rasterizada: se mira la cabecera, no el
      // nombre ni el tipo MIME que diga el navegador.
      const svgDisguised = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>');
      await page.setInputFiles('#logo', { name: 'logo.png', mimeType: 'image/png', buffer: svgDisguised });
      await expect(page.locator('#logo-error')).toHaveText('That file is not a PNG, JPG or WebP image.');
      await expect(page.locator('#logo-note')).toBeHidden();
      await expect(page.locator('#ec')).toBeEnabled();

      const plainText = Buffer.from('esto no es ninguna imagen, solo texto');
      await page.setInputFiles('#logo', { name: 'logo.png', mimeType: 'image/png', buffer: plainText });
      await expect(page.locator('#logo-error')).toHaveText('That file is not a PNG, JPG or WebP image.');
      await expect(page.locator('#logo-note')).toBeHidden();

      // Cabecera PNG válida pero de más de 5 MB: el tamaño se mira antes que los bytes mágicos.
      const tooLarge = Buffer.alloc(5 * 1024 * 1024 + 1);
      tooLarge.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
      await page.setInputFiles('#logo', { name: 'grande.png', mimeType: 'image/png', buffer: tooLarge });
      await expect(page.locator('#logo-error')).toHaveText('The logo is too large (maximum 5 MB).');
      await expect(page.locator('#logo-note')).toBeHidden();
    });

    test('captura de pantalla con logo y colores personalizados', async ({ context, extId }) => {
      const page = await openCreate(context, extId);
      await openOptions(page);
      await page.locator('#f-url').fill('https://ejemplo.test/captura-logo');
      await page.locator('#fg').fill('#1a237e');
      await page.locator('#bg').fill('#fff8e1');
      await expect(page.locator('#check')).toHaveText(VERIFIED_EN, { timeout: 10_000 });
      await page.setInputFiles('#logo', { name: 'logo.png', mimeType: 'image/png', buffer: await makeLogo(page, 'image/png') });
      await expect(page.locator('#check')).toHaveText(VERIFIED_EN, { timeout: 10_000 });
      await page.setViewportSize({ width: 900, height: 700 });
      await page.screenshot({ path: 'test-results/crear-logo.png' });
    });
  });
});
