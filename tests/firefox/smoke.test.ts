// Pruebas de humo en Firefox real (geckodriver + Selenium), con la build E2E instalada como complemento temporal.
// Se ejecuta con: npm run test:firefox
//
// geckodriver no deja navegar a moz-extension:// ni ejecutar scripts en páginas de extensión, así que:
// - la build E2E abre popup.html en una pestaña al instalarse (entrypoints/background.ts), y
// - el test controla la extensión con el puente de lib/e2e-bridge.ts (escribir orden → pulsar → leer resultado).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { after, before, beforeEach, describe, test } from 'node:test';
import { download } from 'geckodriver';
import { Builder, By, Origin, until, type WebDriver } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';

const ADDON_ID = 'mirilla@ramoncoroso.github.io';
const UUID = '5b1f1c1e-6a1d-4c39-9e38-7d0d6f1b6e11';
const POPUP = `moz-extension://${UUID}/popup.html`;
const fixture = (name: string) => path.resolve('tests/e2e/fixtures', name);
const MIME: Record<string, string> = { '.png': 'image/png', '.svg': 'image/svg+xml' };

// ---- Web de pruebas ----

const pages = new Map<string, string>();
let server: Server;
let origin = '';

function page(pathname: string, body: string) {
  pages.set(pathname, `<!doctype html><html><body style="margin:0;background:#fff">${body}</body></html>`);
  return origin + pathname;
}

// ---- Navegador ----

const popupHandles = new WeakMap<WebDriver, string>();

async function launch(prefs: Record<string, string | number | boolean> = {}): Promise<WebDriver> {
  const options = new firefox.Options().addArguments('-headless').windowSize({ width: 1280, height: 800 });
  // UUID fijo para reconocer la pestaña moz-extension:// del popup.
  options.setPreference('extensions.webextensions.uuids', JSON.stringify({ [ADDON_ID]: UUID }));
  for (const [k, v] of Object.entries(prefs)) options.setPreference(k, v);
  const driver = await new Builder()
    .forBrowser('firefox')
    .setFirefoxOptions(options)
    .setFirefoxService(new firefox.ServiceBuilder(await download()))
    .build();
  await (driver as firefox.Driver).installAddon(path.resolve(process.env.MIRILLA_XPI!), true);

  let popup = '';
  await driver.wait(async () => {
    for (const handle of await driver.getAllWindowHandles()) {
      await driver.switchTo().window(handle);
      if ((await driver.getCurrentUrl()) === POPUP) popup = handle;
    }
    return popup !== '';
  }, 10000);
  popupHandles.set(driver, popup);
  await closeOtherTabs(driver);
  return driver;
}

async function closeOtherTabs(driver: WebDriver) {
  const popup = popupHandles.get(driver)!;
  for (const handle of await driver.getAllWindowHandles()) {
    if (handle === popup) continue;
    await driver.switchTo().window(handle);
    await driver.close();
  }
  await driver.switchTo().window(popup);
}

let seq = 0;

/** Ejecuta una orden del puente E2E en el popup y vuelve a la pestaña en la que se estaba. */
async function bridge<T>(driver: WebDriver, cmd: Record<string, unknown>): Promise<T> {
  const current = await driver.getWindowHandle();
  await driver.switchTo().window(popupHandles.get(driver)!);
  const id = ++seq;
  const input = await driver.findElement(By.id('e2e-cmd'));
  await input.clear();
  await input.sendKeys(JSON.stringify({ ...cmd, seq: id }));
  await driver.findElement(By.id('e2e-run')).click();
  const out = await driver.findElement(By.id('e2e-out'));
  // getDomAttribute/getText son comandos nativos; getAttribute inyecta un script y falla en páginas de extensión.
  await driver.wait(async () => (await out.getDomAttribute('data-seq')) === String(id), 15000);
  const result = JSON.parse(await out.getText()) as { ok: boolean; value: T; error?: string };
  await driver.switchTo().window(current);
  if (!result.ok) throw new Error(`puente E2E (${String(cmd.op)}): ${result.error}`);
  return result.value;
}

const history = (driver: WebDriver) => bridge<string[]>(driver, { op: 'history' });

async function waitHistory(driver: WebDriver, expected: (h: string[]) => boolean, ms = 8000) {
  const end = Date.now() + ms;
  let last: string[] = [];
  while (Date.now() < end) {
    last = await history(driver);
    if (expected(last)) return last;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.fail(`historial inesperado: ${JSON.stringify(last)}`);
}

/**
 * Abre la página en una ventana nueva y devuelve su tabId. Ventana y no pestaña: en Firefox, cambiar a la
 * pestaña del popup para usar el puente la activa, y captureVisibleTab capturaría el popup.
 */
async function openTab(driver: WebDriver, url: string): Promise<number> {
  await driver.switchTo().newWindow('window');
  // Las ventanas nuevas no heredan el tamaño de la principal.
  await driver.manage().window().setRect({ width: 1280, height: 800 });
  await driver.get(url);
  await driver.wait(async () => driver.executeScript('return Array.from(document.images).every((i) => i.complete)'), 5000);
  const tabId = await bridge<number>(driver, { op: 'tabIdByUrl', url });
  await bridge(driver, { op: 'activate', tabId });
  return tabId;
}

const callMenu = (driver: WebDriver, fn: string, tabId: number, arg?: string) => bridge(driver, { op: 'menu', fn, tabId, arg });

async function selectElement(driver: WebDriver, tabId: number, css: string) {
  await callMenu(driver, 'startSelection', tabId);
  await driver.sleep(300);
  const r = await driver.executeScript<{ x: number; y: number; w: number; h: number }>(
    `const r = document.querySelector(arguments[0]).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height };`,
    css,
  );
  const at = (x: number, y: number) => ({ x: Math.round(x), y: Math.round(y), origin: Origin.VIEWPORT });
  await driver
    .actions()
    .move(at(r.x - 20, r.y - 20))
    .press()
    .move({ ...at(r.x + r.w / 2, r.y + r.h / 2), duration: 100 })
    .move({ ...at(r.x + r.w + 20, r.y + r.h + 20), duration: 100 })
    .release()
    .perform();
}

before(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://x');
    if (url.pathname.startsWith('/fixtures/')) {
      const file = path.basename(url.pathname);
      res.writeHead(200, { 'content-type': MIME[path.extname(file)]! }).end(readFileSync(fixture(file)));
      return;
    }
    const html = pages.get(url.pathname);
    if (html === undefined) res.writeHead(404).end();
    else res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => server.close());

describe('Firefox', () => {
  let driver: WebDriver;
  before(async () => {
    driver = await launch();
  });
  after(async () => driver?.quit());
  beforeEach(async () => {
    // Cada prueba empieza con el historial vacío y solo la pestaña del popup.
    await closeOtherTabs(driver);
    await bridge(driver, { op: 'clear' });
  });

  test('el popup decodifica un fichero (WASM con la CSP de MV3) y marca el enlace peligroso', async () => {
    assert.equal(await driver.findElement(By.id('scan')).getText(), 'Scan visible area');
    // El input de fichero está oculto; geckodriver permite subir ficheros a inputs ocultos.
    await driver.findElement(By.id('file')).sendKeys(fixture('qr-wifi.png'));
    const kind = await driver.wait(until.elementLocated(By.css('.qr-kind')), 8000);
    await driver.wait(until.elementTextIs(kind, 'Wi-Fi network'), 8000);
    await driver.findElement(By.id('file')).sendKeys(fixture('qr-url.png'));
    await driver.wait(until.elementLocated(By.css('.qr-danger')), 8000);
    assert.match(await driver.findElement(By.css('.qr-danger')).getText(), /www\.paypal\.com@/);
    assert.equal(await driver.findElement(By.css('.qr-domain')).getText(), 'evil.example');
  });

  test('GS1: interpreta un Data Matrix con AIs y un código generado se vuelve a leer', async () => {
    await driver.findElement(By.id('file')).sendKeys(fixture('datamatrix-gs1.png'));
    const kind = await driver.wait(until.elementLocated(By.css('.qr-card .qr-kind')), 8000);
    await driver.wait(until.elementTextIs(kind, 'GS1 data'), 8000);
    const value = async (label: string) =>
      driver.findElement(By.xpath(`//dl[@class='qr-dl']/dt[normalize-space()='${label}']/following-sibling::dd[1]`)).getText();
    assert.equal(await value('Batch/lot (10)'), 'LOTE42');
    assert.equal(await value('Net weight (3103)'), '1.250 kg');
    assert.equal(await value('GS1 prefix'), 'Spain, Andorra');
    assert.deepEqual(await bridge(driver, { op: 'roundTrip', text: 'https://example.com/firefox' }), ['https://example.com/firefox']);
  });

  test('seleccionar área: inyecta, captura, recorta y decodifica en el background', async () => {
    const tabId = await openTab(driver, page('/area', `<img id="qr" src="/fixtures/qr-url.png" style="position:absolute;left:300px;top:200px">`));
    await selectElement(driver, tabId, '#qr');
    await waitHistory(driver, (h) => h[0] === 'https://www.paypal.com@evil.example/login');
  });

  test('menú «Leer código de esta imagen»: camino fetch con la imagen fuera de la vista', async () => {
    const src = `data:image/png;base64,${readFileSync(fixture('qr-safe.png')).toString('base64')}`;
    const tabId = await openTab(driver, page('/fetch', `<img src="${src}" style="position:absolute;top:4000px">`));
    await callMenu(driver, 'readImage', tabId, src);
    await waitHistory(driver, (h) => h[0] === 'https://example.com/');
  });

  test('menú «Leer código de esta imagen»: SVG visible', async () => {
    const tabId = await openTab(driver, page('/svg', `<img src="/fixtures/qr.svg" style="position:absolute;left:200px;top:150px">`));
    await callMenu(driver, 'readImage', tabId, `${origin}/fixtures/qr.svg`);
    await waitHistory(driver, (h) => h[0] === 'https://example.org/svg');
  });

  test('buscar en lo visible: tres códigos de formatos distintos', async () => {
    const tabId = await openTab(
      driver,
      page(
        '/multi',
        `<img src="/fixtures/qr-wifi.png" style="position:absolute;left:40px;top:40px">
         <img src="/fixtures/ean13.png" style="position:absolute;left:420px;top:60px">
         <img src="/fixtures/datamatrix-gs1.png" style="position:absolute;left:820px;top:40px">`,
      ),
    );
    await callMenu(driver, 'scanVisible', tabId);
    const h = await waitHistory(driver, (h) => h.length === 3);
    assert.ok(h.includes('8412345678905'));
  });

  test('zoom al 150 %: la selección de área recorta el sitio correcto', async () => {
    const tabId = await openTab(driver, page('/zoom', `<img id="qr" src="/fixtures/qr-safe.png" style="position:absolute;left:300px;top:150px">`));
    await bridge(driver, { op: 'setZoom', tabId, zoom: 1.5 });
    await driver.wait(async () => (await driver.executeScript('return devicePixelRatio')) === 1.5, 5000);
    await selectElement(driver, tabId, '#qr');
    await waitHistory(driver, (h) => h[0] === 'https://example.com/');
  });
});

describe('Firefox HiDPI (devPixelsPerPx 2)', () => {
  let driver: WebDriver;
  before(async () => {
    driver = await launch({ 'layout.css.devPixelsPerPx': '2.0' });
  });
  after(async () => driver?.quit());

  test('la selección de área recorta bien con píxeles físicos al doble', async () => {
    const tabId = await openTab(driver, page('/hidpi', `<img id="qr" src="/fixtures/qr-safe.png" style="position:absolute;left:200px;top:100px">`));
    assert.equal(await driver.executeScript('return devicePixelRatio'), 2);
    await selectElement(driver, tabId, '#qr');
    await waitHistory(driver, (h) => h[0] === 'https://example.com/');
  });
});
