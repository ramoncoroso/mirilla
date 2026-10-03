// Pruebas de humo en Firefox real (geckodriver + Selenium), con la build E2E instalada como complemento temporal.
// Se ejecuta con: npm run test:firefox
//
// Firefox 157+ no deja que geckodriver toque las pestañas moz-extension:// (ni navegar, ni leer, ni pulsar), así que:
// - el test manda órdenes desde la propia página de pruebas (http) con postMessage; el script de contenido e2e-relay
//   (solo en la build E2E) las pasa al background, que las ejecuta (lib/e2e-bridge.ts);
// - lo que se comprueba de la interfaz se mira en el panel de la página (shadow root abierto en la build E2E).
//   El popup en sí (fichero, pegar) se prueba en Chromium.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { after, before, beforeEach, describe, test } from 'node:test';
import { download } from 'geckodriver';
import { Builder, By, Origin, until, type WebDriver } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';

const fixture = (name: string) => path.resolve('tests/e2e/fixtures', name);
const MIME: Record<string, string> = { '.png': 'image/png', '.svg': 'image/svg+xml', '.pdf': 'application/pdf' };

// ---- Web de pruebas ----

const pages = new Map<string, string>();
let server: Server;
let origin = '';

function page(pathname: string, body: string) {
  pages.set(pathname, `<!doctype html><html><body style="margin:0;background:#fff">${body}</body></html>`);
  return origin + pathname;
}

// ---- Navegador ----

async function launch(prefs: Record<string, string | number | boolean> = {}): Promise<WebDriver> {
  const options = new firefox.Options().addArguments('-headless').windowSize({ width: 1280, height: 800 });
  for (const [k, v] of Object.entries(prefs)) options.setPreference(k, v);
  const driver = await new Builder()
    .forBrowser('firefox')
    .setFirefoxOptions(options)
    .setFirefoxService(new firefox.ServiceBuilder(await download()))
    .build();
  await (driver as firefox.Driver).installAddon(path.resolve(process.env.MIRILLA_XPI!), true);
  await driver.get(page('/control', '<p>Mirilla E2E</p>'));
  return driver;
}

/** Deja solo la primera ventana, en la página de control. */
async function reset(driver: WebDriver) {
  const [first, ...rest] = await driver.getAllWindowHandles();
  for (const handle of rest) {
    await driver.switchTo().window(handle);
    await driver.close();
  }
  await driver.switchTo().window(first!);
  await driver.get(page('/control', '<p>Mirilla E2E</p>'));
}

let seq = 0;

/** Ejecuta una orden en el background desde la página actual (que debe ser de la web de pruebas). */
async function bridge<T>(driver: WebDriver, cmd: Record<string, unknown>): Promise<T> {
  await driver.wait(async () => (await driver.executeScript('return document.documentElement.dataset.mirillaE2e')) === 'ready', 10000);
  const id = ++seq;
  const result = await driver.executeAsyncScript<{ ok: boolean; value: T; error?: string }>(
    `const [cmd, seq, done] = arguments;
     addEventListener('message', function h(e) {
       if (e.data?.mirillaE2EResult?.seq !== seq) return;
       removeEventListener('message', h);
       done(e.data.mirillaE2EResult.result);
     });
     postMessage({ mirillaE2E: { seq, cmd } }, '*');`,
    cmd,
    id,
  );
  if (!result?.ok) throw new Error(`puente E2E (${String(cmd.op)}): ${result?.error}`);
  return result.value;
}

/** Texto de un elemento dentro del panel de Mirilla (shadow root abierto solo en la build E2E). */
async function panelText(driver: WebDriver, css: string): Promise<string | null> {
  return driver.executeScript<string | null>(`return document.querySelector('mirilla-ui')?.shadowRoot?.querySelector(arguments[0])?.textContent ?? null`, css);
}

async function waitPanel(driver: WebDriver, css: string, ms = 8000): Promise<string> {
  let text: string | null = null;
  await driver.wait(async () => (text = await panelText(driver, css)) !== null, ms);
  return text!;
}

interface MarkExpectation {
  /** Nombre de fichero de la imagen (tal y como aparece al final de su src). */
  file: string;
  /** Texto que solo aparece en la tarjeta de esta imagen. */
  needle: string;
  danger?: boolean;
}

/**
 * Para cada imagen esperada, comprueba que su tarjeta tiene un recuadro (`.mark`) que contiene el centro
 * de la imagen y no es mucho mayor que ella; y que el veredicto peligroso dibuja `mark-danger`.
 */
async function checkMarksOverlayImages(driver: WebDriver, images: MarkExpectation[]) {
  await driver.wait(
    async () =>
      (await driver.executeScript<number>(`return document.querySelector('mirilla-ui')?.shadowRoot?.querySelectorAll('.mark').length ?? 0`)) === images.length,
    8000,
  );
  const results = await driver.executeScript<
    { file: string; found: boolean; contains: boolean; danger: boolean; markW: number; markH: number; imgW: number; imgH: number }[]
  >(
    `const [images] = arguments;
     const root = document.querySelector('mirilla-ui').shadowRoot;
     const cards = Array.from(root.querySelectorAll('.qr-card'));
     return images.map((spec) => {
       const card = cards.find((c) => c.textContent.includes(spec.needle));
       if (!card) return { file: spec.file, found: false };
       const n = card.querySelector('.qr-num').textContent;
       const mark = root.querySelector('.mark[data-n="' + n + '"]');
       const markRect = mark.getBoundingClientRect();
       const img = Array.from(document.images).find((i) => i.src.endsWith(spec.file));
       const imgRect = img.getBoundingClientRect();
       const cx = imgRect.left + imgRect.width / 2;
       const cy = imgRect.top + imgRect.height / 2;
       const contains = cx >= markRect.left && cx <= markRect.right && cy >= markRect.top && cy <= markRect.bottom;
       return {
         file: spec.file, found: true, contains, danger: mark.classList.contains('mark-danger'),
         markW: markRect.width, markH: markRect.height, imgW: imgRect.width, imgH: imgRect.height,
       };
     });`,
    images,
  );
  for (const [i, r] of results.entries()) {
    const spec = images[i]!;
    assert.ok(r.found, `no se encontró la tarjeta de ${spec.file}`);
    assert.ok(r.contains, `el recuadro de ${spec.file} no contiene el centro de la imagen: ${JSON.stringify(r)}`);
    assert.ok(r.markW < r.imgW * 1.5 && r.markH < r.imgH * 1.5, `el recuadro de ${spec.file} es demasiado grande: ${JSON.stringify(r)}`);
    assert.equal(r.danger, !!spec.danger, `recuadro de ${spec.file}: danger esperado ${!!spec.danger}, fue ${r.danger}`);
  }
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

/** Abre la página en una ventana nueva (con su propio tamaño de viewport) y devuelve su tabId. */
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
  // mirilla-ui está en el DOM normal de la página: se espera a que aparezca en lugar de dormir un tiempo fijo.
  await driver.wait(until.elementLocated(By.css('mirilla-ui')), 5000);
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
    // Cada prueba empieza con el almacenamiento vacío y solo la ventana de control.
    await reset(driver);
    await bridge(driver, { op: 'clear' });
  });

  test('lee una imagen en el background (WASM con la CSP de MV3) y el panel marca el enlace peligroso', async () => {
    const tabId = await openTab(driver, page('/peligro', `<img src="/fixtures/qr-url.png" style="position:absolute;left:40px;top:40px">`));
    await callMenu(driver, 'readImage', tabId, `${origin}/fixtures/qr-url.png`);
    assert.match(await waitPanel(driver, '.qr-danger'), /www\.paypal\.com@/);
    assert.equal(await panelText(driver, '.qr-domain'), 'evil.example');
    assert.equal(await panelText(driver, '.qr-verdict-label'), 'Danger');
    assert.equal(await bridge(driver, { op: 'badge', tabId }), '!');
  });

  test('GS1: interpreta un Data Matrix con AIs y un código generado se vuelve a leer', async () => {
    const tabId = await openTab(driver, page('/gs1', `<img src="/fixtures/datamatrix-gs1.png" style="position:absolute;left:40px;top:40px">`));
    await callMenu(driver, 'readImage', tabId, `${origin}/fixtures/datamatrix-gs1.png`);
    assert.equal(await waitPanel(driver, '.qr-card .qr-kind'), 'GS1 data');
    const rows = await driver.executeScript<Record<string, string>>(`
      const dl = document.querySelector('mirilla-ui').shadowRoot.querySelector('.qr-dl');
      return Object.fromEntries([...dl.querySelectorAll('dt')].map((dt) => [dt.textContent.trim(), dt.nextElementSibling.textContent]));`);
    assert.equal(rows['Batch/lot (10)'], 'LOTE42');
    assert.equal(rows['Net weight (3103)'], '1.250 kg');
    assert.equal(rows['GS1 prefix'], 'Spain, Andorra');
    assert.deepEqual(await bridge(driver, { op: 'roundTrip', text: 'https://example.com/firefox' }), ['https://example.com/firefox']);
  });

  test('sitios de confianza: el panel marca ✅ el propio y ⛔ su imitación', async () => {
    await bridge(driver, { op: 'setStorage', items: { trustedSites: ['mibancolocal.es'] } });
    const tabId = await openTab(
      driver,
      page('/confianza', `<img src="/fixtures/qr-trusted.png" style="position:absolute;left:40px;top:40px">
                          <img src="/fixtures/qr-imita.png" style="position:absolute;left:40px;top:400px">`),
    );
    await callMenu(driver, 'readImage', tabId, `${origin}/fixtures/qr-trusted.png`);
    assert.equal(await waitPanel(driver, '.qr-verdict-trusted .qr-verdict-label'), 'Trusted site');
    await callMenu(driver, 'readImage', tabId, `${origin}/fixtures/qr-imita.png`);
    assert.equal(await waitPanel(driver, '.qr-verdict-danger .qr-verdict-label'), 'Danger');
    assert.match((await panelText(driver, '.qr-danger'))!, /one of your trusted sites/);
  });

  test('PDF: pdf.js lee las páginas con la CSP de la extensión', async () => {
    assert.deepEqual(await bridge(driver, { op: 'pdf', url: `${origin}/fixtures/quishing.pdf` }), [
      [2, ['https://www.paypal.com@evil.example/login']],
      [3, ['https://example.com/']],
    ]);
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

  test('buscar en lo visible: dibuja un recuadro sobre cada código, con el peligroso marcado', async () => {
    const tabId = await openTab(
      driver,
      page(
        '/marcar',
        `<img src="/fixtures/qr-safe.png" style="position:absolute;left:40px;top:40px">
         <img src="/fixtures/qr-url.png" style="position:absolute;left:420px;top:60px">`,
      ),
    );
    await callMenu(driver, 'scanVisible', tabId);
    await driver.wait(
      async () => (await driver.executeScript<number>(`return document.querySelector('mirilla-ui')?.shadowRoot?.querySelectorAll('.qr-card').length ?? 0`)) === 2,
      8000,
    );
    await checkMarksOverlayImages(driver, [
      { file: 'qr-safe.png', needle: 'example.com' },
      { file: 'qr-url.png', needle: 'evil.example', danger: true },
    ]);
  });

  test('seguridad: una hoja de estilos hostil y un Escape falso no ocultan el aviso de peligro', async () => {
    const tabId = await openTab(
      driver,
      page(
        '/hostil',
        `<style>mirilla-ui { display:none !important; visibility:hidden !important; opacity:0 !important;
           --qr-danger-fg: transparent !important; --qr-danger-bg: transparent !important; }</style>
         <img src="/fixtures/qr-url.png" style="position:absolute;left:40px;top:200px">`,
      ),
    );
    await callMenu(driver, 'scanVisible', tabId);
    await waitHistory(driver, (h) => h[0] === 'https://www.paypal.com@evil.example/login');
    const state = () =>
      driver.executeScript<{ open: boolean; display: string; visibility: string; opacity: string; color: string | null }>(`
        const host = document.querySelector('mirilla-ui');
        const danger = host?.shadowRoot?.querySelector('.qr-danger');
        const cs = host ? getComputedStyle(host) : {};
        return { open: !!host?.shadowRoot?.querySelector('.panel'), display: cs.display, visibility: cs.visibility,
                 opacity: cs.opacity, color: danger ? getComputedStyle(danger).color : null };`);
    await driver.wait(async () => (await state()).open, 5000);
    await driver.executeScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));`);
    await driver.sleep(200);
    const s = await state();
    assert.equal(s.open, true);
    assert.notEqual(s.display, 'none');
    assert.equal(s.visibility, 'visible');
    assert.equal(s.opacity, '1');
    assert.equal(s.color, 'rgb(179, 38, 30)');
  });

  test('zoom al 150 %: la selección de área recorta el sitio correcto', async () => {
    const tabId = await openTab(driver, page('/zoom', `<img id="qr" src="/fixtures/qr-safe.png" style="position:absolute;left:300px;top:150px">`));
    await bridge(driver, { op: 'setZoom', tabId, zoom: 1.5 });
    await driver.wait(async () => (await driver.executeScript('return devicePixelRatio')) === 1.5, 5000);
    await selectElement(driver, tabId, '#qr');
    await waitHistory(driver, (h) => h[0] === 'https://example.com/');
  });
});

describe('Firefox: página de escaneo con cámara falsa', () => {
  let driver: WebDriver;
  before(async () => {
    // Cámara falsa (patrón de colores, sin QR) y sin el aviso de permiso: comprueba que la página de la extensión
    // puede abrir la cámara sin ningún permiso en el manifest.
    driver = await launch({ 'media.navigator.streams.fake': true, 'media.navigator.permission.disabled': true });
  });
  after(async () => driver?.quit());

  test('abre la cámara sin permisos en el manifest y la apaga al cerrar la pestaña', async () => {
    await bridge(driver, { op: 'clear' });
    const tabId = await bridge<number>(driver, { op: 'openScan', mode: 'camera' });
    await driver.wait(async () => (await bridge<string | null>(driver, { op: 'getStorage', key: 'e2eScanState' })) === 'live:camera', 10000);
    await driver.executeScript('return 1'); // la ventana de control sigue siendo controlable
    await bridge(driver, { op: 'closeTab', tabId });
    await driver.wait(async () => (await bridge<string | null>(driver, { op: 'getStorage', key: 'e2eScanState' })) === 'stopped', 10000);
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
    await checkMarksOverlayImages(driver, [{ file: 'qr-safe.png', needle: 'example.com' }]);
  });
});
