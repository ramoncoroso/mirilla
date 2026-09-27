// Genera las imágenes de las fichas de las tiendas (npm run store:assets) en store/assets/:
// - <lang>/screenshot-N.png (1280×800): escenas reales con la extensión, dentro de un marco con titular
// - promo-small-440x280.png, promo-marquee-1400x560.png, logo-300.png
// Las páginas de ejemplo son ficticias (dominios .example): nada imita a una marca real.

import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { BrowserContext, Page } from '@playwright/test';
import { prepareZXingModule, writeBarcode } from 'zxing-wasm/writer';
import { callMenu, fixture, openPage, tabIdOf, test } from '../tests/e2e/setup';

const require = createRequire(import.meta.url);
prepareZXingModule({ overrides: { wasmBinary: readFileSync(require.resolve('zxing-wasm/writer/zxing_writer.wasm')) } });

const OUT = 'store/assets';
const ICON = `data:image/svg+xml;base64,${readFileSync('store/icon.svg').toString('base64')}`;

async function barcode(text: string, format: string, options?: string, scale = 5): Promise<string> {
  const { image, error } = await writeBarcode(text, { format: format as 'QRCode', options, scale });
  if (error || !image) throw new Error(error);
  return `data:image/png;base64,${Buffer.from(await image.arrayBuffer()).toString('base64')}`;
}

const png = (buf: Buffer) => `data:image/png;base64,${buf.toString('base64')}`;

// ---- Textos de las escenas ----

const COPY = {
  en: {
    tagline: 'See where a code leads before you open it',
    footer: '100% local · no tracking · open source',
    s1: ['Spot QR phishing at a glance', 'Mirilla highlights the real domain and explains the trick before you open anything.'],
    s2: ['Read any code on the page', 'Right-click an image or drag over anything visible: canvases, videos, backgrounds.'],
    s3: ['Understands GS1 labels', 'GTIN, SSCC, batch, expiry, weight… with check-digit validation.'],
    s4: ['Wi-Fi, contacts, payments…', 'Copy a Wi-Fi password, see a contact or check a SEPA payment in one click.'],
    s5: ['Share any page as a QR code', 'Generate the QR of the current page and download or copy it.'],
    mail: {
      inbox: 'Inbox', from: 'IT Support', subject: 'Action required: re-verify your account',
      body: 'Your session expires today. Scan this QR code with your phone to keep access to your account.',
      sign: 'IT Support Team',
    },
    slide: { title: 'Webinar: Warehouse automation 2026', note: 'Scan to download the slides', by: 'Slides rendered in a canvas' },
    wms: { title: 'Goods receipt', dock: 'Dock 3 · Pallet label', ship: 'SHIP FROM', to: 'SHIP TO' },
  },
  es: {
    tagline: 'Mira adónde lleva un código antes de abrirlo',
    footer: '100 % local · sin rastreo · código abierto',
    s1: ['Detecta el phishing con QR de un vistazo', 'Mirilla resalta el dominio real y explica el engaño antes de que abras nada.'],
    s2: ['Lee cualquier código de la página', 'Clic derecho en una imagen o arrastra sobre lo que se vea: canvas, vídeos, fondos.'],
    s3: ['Entiende las etiquetas GS1', 'GTIN, SSCC, lote, caducidad, peso… y valida el dígito de control.'],
    s4: ['WiFi, contactos, pagos…', 'Copia la contraseña del WiFi, ve un contacto o revisa un pago SEPA con un clic.'],
    s5: ['Comparte cualquier página como QR', 'Genera el QR de la página actual y descárgalo o cópialo.'],
    mail: {
      inbox: 'Recibidos', from: 'Soporte TI', subject: 'Acción necesaria: vuelve a verificar tu cuenta',
      body: 'Tu sesión caduca hoy. Escanea este código QR con el móvil para mantener el acceso a tu cuenta.',
      sign: 'Equipo de Soporte TI',
    },
    slide: { title: 'Webinar: Automatización de almacenes 2026', note: 'Escanea para descargar las diapositivas', by: 'Diapositivas dibujadas en un canvas' },
    wms: { title: 'Recepción de mercancía', dock: 'Muelle 3 · Etiqueta de palé', ship: 'ORIGEN', to: 'DESTINO' },
  },
} as const;

// ---- Marco 1280×800 con titular ----

async function frame(context: BrowserContext, pages: Map<string, string>, lang: 'en' | 'es', file: string, headline: string, sub: string, shot: Buffer, narrow = false) {
  const c = COPY[lang];
  const page = await openPage(
    context,
    pages,
    `/frame-${file}`,
    `<style>
      /* El fondo va en .wrap: openPage pone background:#fff en línea sobre <body>. */
      body { overflow:hidden; }
      .wrap { width:1280px; font-family: system-ui, "Segoe UI", sans-serif; color:#fff;
              background: radial-gradient(circle at 20% 10%, #2f7cf0 0%, #1a5fc8 45%, #0d3a86 100%);
              display:flex; height:800px; align-items:center; gap:48px; padding:0 56px; box-sizing:border-box; }
      .text { flex: 0 0 360px; }
      .brand { display:flex; align-items:center; gap:12px; font-weight:700; font-size:24px; margin-bottom:40px; }
      .brand img { width:44px; height:44px; border-radius:10px; box-shadow: 0 0 0 2px rgba(255,255,255,.4); }
      h1 { font-size:40px; line-height:1.12; margin:0 0 18px; letter-spacing:-0.5px; }
      p { font-size:19px; line-height:1.45; margin:0; color:#dbe7ff; }
      .foot { margin-top:40px; font-size:14px; color:#b7cdf7; }
      .shot { flex:1; display:flex; justify-content:center; }
      .shot img { max-width:${narrow ? 420 : 780}px; max-height:680px; border-radius:${narrow ? 14 : 10}px;
                  box-shadow: 0 24px 60px rgba(0,0,0,.45); background:#fff; }
    </style>
    <div class="wrap">
      <div class="text">
        <div class="brand"><img src="${ICON}" alt="">Mirilla</div>
        <h1>${headline}</h1>
        <p>${sub}</p>
        <div class="foot">${c.footer}</div>
      </div>
      <div class="shot"><img src="${png(shot)}" alt=""></div>
    </div>`,
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: `${OUT}/${lang}/${file}` });
  await page.close();
}

/** Ajusta la altura del popup a su contenido (sin hueco blanco debajo). */
async function fitPopup(popup: Page) {
  await popup.setViewportSize({ width: 360, height: await popup.evaluate(() => document.body.scrollHeight) });
}

/** Espera a que el panel (shadow DOM cerrado) termine de pintarse. */
const settle = (page: Page, ms = 900) => page.waitForTimeout(ms);

for (const lang of ['en', 'es'] as const) {
  test.describe(`capturas ${lang}`, () => {
    test.use({ lang, viewport: { width: 1000, height: 660 } });
    test.beforeAll(() => mkdirSync(`${OUT}/${lang}`, { recursive: true }));

    test('1 · phishing con QR en un email', async ({ context, sw, pages }) => {
      const c = COPY[lang];
      const qr = await barcode('https://login.company.example@account-verify.example/session', 'QRCode', undefined, 5);
      const page = await openPage(
        context,
        pages,
        '/mail',
        `<style>
          body { font-family: system-ui, sans-serif; color:#202124; }
          .top { height:52px; background:#f1f3f4; border-bottom:1px solid #dadce0; display:flex; align-items:center; padding:0 20px; font-weight:600; color:#5f6368; }
          .side { position:absolute; top:52px; left:0; width:180px; bottom:0; border-right:1px solid #eee; padding:16px; box-sizing:border-box; color:#5f6368; }
          .side b { display:block; background:#e8f0fe; color:#1a56c4; border-radius:16px; padding:6px 12px; }
          .mail { position:absolute; top:52px; left:180px; right:0; padding:24px 32px; }
          h2 { font-size:21px; font-weight:500; margin:0 0 12px; }
          .from { color:#5f6368; font-size:13px; margin-bottom:22px; }
          .from b { color:#202124; }
        </style>
        <div class="top">✉ Mail</div>
        <div class="side"><b>${c.mail.inbox}</b></div>
        <div class="mail">
          <h2>${c.mail.subject}</h2>
          <div class="from"><b>${c.mail.from}</b> &lt;it-support@company.example&gt;</div>
          <p>${c.mail.body}</p>
          <img id="qr" src="${qr}" style="margin:12px 0 16px">
          <p>${c.mail.sign}</p>
        </div>`,
      );
      await page.bringToFront();
      const src = await page.locator('#qr').getAttribute('src');
      await callMenu(sw, 'readImage', await tabIdOf(sw, page), src!);
      await settle(page);
      // La escena sin marco se guarda también para el promocional grande.
      const shot = await page.screenshot({ path: `test-results/store/scene-1-${lang}.png` });
      await frame(context, pages, lang, 'screenshot-1.png', c.s1[0], c.s1[1], shot);
    });

    test('2 · seleccionar un área (canvas)', async ({ context, sw, pages }) => {
      const c = COPY[lang];
      const qr = await barcode('https://webinar.example/slides/warehouse-2026.pdf', 'QRCode', undefined, 4);
      const page = await openPage(
        context,
        pages,
        '/webinar',
        `<style> body { font-family: system-ui, sans-serif; background:#111; color:#eee; } h1 { font-size:22px; margin:18px 28px; } .by { margin: 8px 28px; color:#999; font-size:13px; } </style>
        <h1>${c.slide.title}</h1>
        <canvas id="slide" width="880" height="480" style="margin:0 28px; border-radius:8px"></canvas>
        <div class="by">${c.slide.by}</div>
        <script>
          const ctx = document.getElementById('slide').getContext('2d');
          const g = ctx.createLinearGradient(0, 0, 880, 480); g.addColorStop(0, '#fdfdfd'); g.addColorStop(1, '#e9eef6');
          ctx.fillStyle = g; ctx.fillRect(0, 0, 880, 480);
          ctx.fillStyle = '#1a3d7c'; ctx.font = 'bold 40px system-ui'; ctx.fillText(${JSON.stringify(c.slide.title.split(': ')[1] ?? c.slide.title)}, 48, 110);
          ctx.fillStyle = '#44546a'; ctx.font = '24px system-ui'; ctx.fillText(${JSON.stringify(c.slide.note)}, 48, 170);
          const img = new Image(); img.onload = () => ctx.drawImage(img, 600, 200); img.src = ${JSON.stringify(qr)};
        </script>`,
      );
      await page.waitForTimeout(300);
      await callMenu(sw, 'startSelection', await tabIdOf(sw, page));
      await page.bringToFront();
      await page.waitForTimeout(300);
      // Arrastre a medio hacer: se ve el recuadro de selección sobre el QR del canvas.
      const box = (await page.locator('#slide').boundingBox())!;
      await page.mouse.move(box.x + 575, box.y + 175);
      await page.mouse.down();
      await page.mouse.move(box.x + 800, box.y + 410, { steps: 8 });
      await page.waitForTimeout(200);
      const shot = await page.screenshot();
      await page.mouse.up();
      await frame(context, pages, lang, 'screenshot-2.png', c.s2[0], c.s2[1], shot);
    });

    test('3 · etiqueta logística GS1', async ({ context, sw, pages }) => {
      const c = COPY[lang];
      const sscc = await barcode('(00)384123450000012342', 'Code128', 'gs1', 2);
      const dm = await barcode('(01)08412345678905(10)L2609-A(17)270331(3103)012500', 'DataMatrix', 'gs1', 5);
      const page = await openPage(
        context,
        pages,
        '/wms',
        `<style>
          body { font-family: system-ui, sans-serif; background:#f4f6f9; color:#1f2933; }
          .bar { background:#243b53; color:#fff; padding:14px 24px; font-weight:600; }
          .label { position:absolute; left:40px; top:80px; width:520px; background:#fff; border:2px solid #111; padding:18px; font-family: Arial, sans-serif; }
          .row { display:flex; gap:16px; border-bottom:1px solid #111; padding-bottom:10px; margin-bottom:10px; font-size:12px; }
          .row div { flex:1 } .k { font-weight:700; font-size:10px; }
          .dock { position:absolute; left:40px; top:52px; color:#52606d; font-size:13px; }
        </style>
        <div class="bar">WMS · ${c.wms.title}</div>
        <div class="dock">${c.wms.dock}</div>
        <div class="label">
          <div class="row"><div><div class="k">${c.wms.ship}</div>Almacenes Norte SL<br>Pol. Ind. Sur, 12<br>28000 Madrid</div><div><div class="k">${c.wms.to}</div>Distribuciones Este SA<br>Av. del Puerto, 7<br>46000 Valencia</div></div>
          <div style="display:flex; align-items:center; gap:20px; margin-bottom:12px"><img src="${dm}"><div style="font-size:13px; line-height:1.6">(01) 08412345678905<br>(10) L2609-A<br>(17) 270331<br>(3103) 012500</div></div>
          <img src="${sscc}" style="display:block; margin:0 auto">
          <div style="text-align:center; font-size:13px; margin-top:4px">(00) 384123450000012342</div>
        </div>`,
      );
      await page.bringToFront();
      await callMenu(sw, 'scanVisible', await tabIdOf(sw, page));
      await settle(page, 1200);
      await frame(context, pages, lang, 'screenshot-3.png', c.s3[0], c.s3[1], await page.screenshot());
    });

    test('4 · popup con una red WiFi', async ({ context, extId, pages }) => {
      const c = COPY[lang];
      const popup = await context.newPage();
      await popup.setViewportSize({ width: 360, height: 600 });
      await popup.goto(`chrome-extension://${extId}/popup.html`);
      await popup.setInputFiles('#file', fixture('qr-wifi.png'));
      await popup.locator('.qr-card').waitFor();
      await fitPopup(popup);
      await frame(context, pages, lang, 'screenshot-4.png', c.s4[0], c.s4[1], await popup.screenshot({ fullPage: true }), true);
    });

    test('5 · QR de la página actual', async ({ context, extId, sw, pages }) => {
      const c = COPY[lang];
      // Una URL "de tienda" (dominio reservado .example) en lugar del dominio interno de las pruebas.
      await context.route('https://shop.example/**', (route) => route.fulfill({ contentType: 'text/html', body: '<h1>Product 42</h1>' }));
      const page = await context.newPage();
      await page.goto('https://shop.example/product/42');
      const popup = await context.newPage();
      await popup.setViewportSize({ width: 360, height: 600 });
      await popup.goto(`chrome-extension://${extId}/popup.html?tab=${await tabIdOf(sw, page)}`);
      await popup.locator('#generate').click();
      await popup.locator('.generated img').waitFor();
      await popup.waitForTimeout(200);
      await fitPopup(popup);
      await frame(context, pages, lang, 'screenshot-5.png', c.s5[0], c.s5[1], await popup.screenshot({ fullPage: true }), true);
    });
  });
}

test('promos y logo', async ({ context, pages }) => {
  mkdirSync(OUT, { recursive: true });
  const c = COPY.en;
  const render = async (name: string, width: number, height: number, body: string) => {
    const page = await openPage(context, pages, `/promo-${name}`, body);
    await page.setViewportSize({ width, height });
    // El logo lleva las esquinas redondeadas sobre fondo transparente.
    await page.screenshot({ path: `${OUT}/${name}`, omitBackground: name.startsWith('logo') });
    await page.close();
  };
  const bg = 'background: radial-gradient(circle at 20% 10%, #2f7cf0 0%, #1a5fc8 45%, #0d3a86 100%) !important; color:#fff; font-family: system-ui, sans-serif; margin:0; overflow:hidden;';

  await render('logo-300.png', 300, 300, `<style>body{margin:0;background:transparent !important}</style><img src="${ICON}" style="width:300px;height:300px;display:block">`);
  await render(
    'promo-small-440x280.png',
    440,
    280,
    `<style>body{${bg} width:440px; height:280px; display:flex; flex-direction:column; justify-content:center; padding:0 36px; box-sizing:border-box}
      .b{display:flex;align-items:center;gap:16px;font-size:40px;font-weight:700} img{width:72px;height:72px} p{font-size:18px;line-height:1.35;color:#dbe7ff;margin:18px 0 0}</style>
      <div class="b"><img src="${ICON}">Mirilla</div><p>${c.tagline}</p>`,
  );
  await render(
    'promo-marquee-1400x560.png',
    1400,
    560,
    `<style>body{${bg} width:1400px; height:560px; display:flex; align-items:center; gap:64px; padding:0 80px; box-sizing:border-box}
      .t{flex:0 0 520px} .b{display:flex;align-items:center;gap:18px;font-size:52px;font-weight:700} .b img{width:92px;height:92px}
      h1{font-size:34px;line-height:1.2;margin:28px 0 14px} p{font-size:19px;color:#b7cdf7;margin:0}
      .s img{width:680px;border-radius:12px;box-shadow:0 24px 60px rgba(0,0,0,.45)}</style>
      <div class="t"><div class="b"><img src="${ICON}">Mirilla</div><h1>${c.tagline}</h1><p>${c.footer}</p></div>
      <div class="s"><img src="${png(readFileSync('test-results/store/scene-1-en.png'))}"></div>`,
  );
});
