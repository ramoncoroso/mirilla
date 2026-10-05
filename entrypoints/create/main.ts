// Generador (Fase 4 · 4.4): un formulario por tipo de contenido, vista previa al momento y «Comprobado: se lee bien»,
// que vuelve a leer el canvas con el lector de Mirilla. Si no coincide con lo esperado, no se ofrece descargarlo.
// Va en su propia pestaña (el popup es pequeño). Se abre desde el popup, ya relleno con la URL de la página.

import { browser } from 'wxt/browser';
import { buildContent, type BuildError, type BuildInput, type BuildKind } from '@/lib/build';
import { decodeImageData } from '@/lib/decode';
import { encodeQr, QrTooLongError, type EcLevel } from '@/lib/generate';
import { t } from '@/lib/i18n';
import { buildSvg, checkColors, DEFAULT_LOGO_RATIO, drawToCanvas, pixelSize, type DrawOptions, type QrMatrix } from '@/lib/qr-draw';
import { el, RESULT_CSS, THEME_CSS, THEME_DARK_CSS } from '@/lib/render';
import type { MessageKey } from '@/locales/messages';

document.documentElement.lang = t('lang');
document.title = t('createTitle');
for (const node of document.querySelectorAll<HTMLElement>('[data-i18n]')) node.textContent = t(node.dataset.i18n as MessageKey);

const style = document.createElement('style');
style.textContent = `:root { ${THEME_CSS} } @media (prefers-color-scheme: dark) { :root { ${THEME_DARK_CSS} } } ${RESULT_CSS}`;
document.head.append(style);

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const kindSelect = $<HTMLSelectElement>('kind');
const fieldsBox = $('fields');
const canvas = $<HTMLCanvasElement>('qr');
const check = $('check');
const pngButton = $<HTMLButtonElement>('png');
const svgButton = $<HTMLButtonElement>('svg');
const copyButton = $<HTMLButtonElement>('copy');
const contentBox = $('content-box');
const content = $('content');
const sizeActual = $('size-actual');
const ecSelect = $<HTMLSelectElement>('ec');
const sizeInput = $<HTMLInputElement>('size');
const fgInput = $<HTMLInputElement>('fg');
const bgInput = $<HTMLInputElement>('bg');
const marginInput = $<HTMLInputElement>('margin');
const colorNote = $('color-note');
const logoInput = $<HTMLInputElement>('logo');
const logoRemove = $<HTMLButtonElement>('logo-remove');
const logoSizeField = $('logo-size-field');
const logoSize = $<HTMLInputElement>('logo-size');
const logoNote = $('logo-note');
const logoError = $('logo-error');

// ---- Formularios ----

interface FieldSpec {
  name: string;
  label: MessageKey;
  type?: 'text' | 'textarea' | 'url' | 'email' | 'tel' | 'password' | 'number' | 'date' | 'datetime-local' | 'checkbox' | 'select';
  options?: [string, MessageKey][];
  /** Campos que van en la misma fila (de dos en dos). */
  row?: string;
  note?: MessageKey;
}

const KINDS: [BuildKind, MessageKey][] = [
  ['url', 'createTypeUrl'],
  ['text', 'createTypeText'],
  ['wifi', 'createTypeWifi'],
  ['contact', 'createTypeContact'],
  ['email', 'createTypeEmail'],
  ['tel', 'createTypeTel'],
  ['sms', 'createTypeSms'],
  ['geo', 'createTypeGeo'],
  ['event', 'createTypeEvent'],
  ['sepa', 'createTypeSepa'],
];

function fieldsFor(kind: BuildKind, values: Record<string, string>): FieldSpec[] {
  switch (kind) {
    case 'url':
      return [{ name: 'url', label: 'cfUrl', type: 'url' }];
    case 'text':
      return [{ name: 'text', label: 'cfText', type: 'textarea' }];
    case 'wifi':
      return [
        { name: 'ssid', label: 'cfSsid' },
        {
          name: 'security',
          label: 'cfSecurity',
          type: 'select',
          options: [['WPA', 'cfSecurityWpa'], ['WEP', 'cfSecurityWep'], ['nopass', 'cfSecurityNone']],
        },
        ...(values.security === 'nopass' ? [] : [{ name: 'password', label: 'cfPassword', type: 'password', note: 'createWifiNote' } as FieldSpec]),
        { name: 'hidden', label: 'cfHidden', type: 'checkbox' },
      ];
    case 'contact':
      return [
        { name: 'firstName', label: 'cfFirstName', row: 'name' },
        { name: 'lastName', label: 'cfLastName', row: 'name' },
        { name: 'org', label: 'cfOrg', row: 'work' },
        { name: 'title', label: 'cfJobTitle', row: 'work' },
        { name: 'phone', label: 'cfPhone', type: 'tel', row: 'reach' },
        { name: 'email', label: 'cfEmail', type: 'email', row: 'reach' },
        { name: 'url', label: 'cfWeb', type: 'url' },
        { name: 'address', label: 'cfAddress' },
        { name: 'note', label: 'cfNote', type: 'textarea' },
      ];
    case 'email':
      return [
        { name: 'to', label: 'cfTo', type: 'email' },
        { name: 'subject', label: 'cfSubject' },
        { name: 'body', label: 'cfBody', type: 'textarea' },
      ];
    case 'tel':
      return [{ name: 'number', label: 'cfNumber', type: 'tel' }];
    case 'sms':
      return [
        { name: 'number', label: 'cfNumber', type: 'tel' },
        { name: 'body', label: 'cfBody', type: 'textarea' },
      ];
    case 'geo':
      return [
        { name: 'lat', label: 'cfLat', type: 'number', row: 'coords' },
        { name: 'lon', label: 'cfLon', type: 'number', row: 'coords' },
        { name: 'query', label: 'cfQuery' },
      ];
    case 'event': {
      const when = values.allDay === 'true' ? 'date' : 'datetime-local';
      return [
        { name: 'title', label: 'cfEventTitle' },
        { name: 'allDay', label: 'cfAllDay', type: 'checkbox' },
        { name: 'start', label: 'cfStart', type: when, row: 'when' },
        { name: 'end', label: 'cfEnd', type: when, row: 'when' },
        { name: 'location', label: 'cfLocation' },
        { name: 'description', label: 'cfDescription', type: 'textarea' },
      ];
    }
    case 'sepa':
      return [
        { name: 'name', label: 'cfName' },
        { name: 'iban', label: 'cfIban', row: 'bank' },
        { name: 'bic', label: 'cfBic', row: 'bank' },
        { name: 'amount', label: 'cfAmount' },
        { name: 'reference', label: 'cfReference' },
      ];
  }
}

const v = (values: Record<string, string>, name: string) => values[name] ?? '';

function toInput(kind: BuildKind, values: Record<string, string>): BuildInput {
  const s = (name: string) => v(values, name);
  switch (kind) {
    case 'url':
      return { kind, url: s('url') };
    case 'text':
      return { kind, text: s('text') };
    case 'wifi':
      return { kind, ssid: s('ssid'), password: s('password'), security: (s('security') || 'WPA') as 'WPA' | 'WEP' | 'nopass', hidden: s('hidden') === 'true' };
    case 'contact':
      return {
        kind,
        firstName: s('firstName'),
        lastName: s('lastName'),
        org: s('org'),
        title: s('title'),
        phone: s('phone'),
        email: s('email'),
        url: s('url'),
        address: s('address'),
        note: s('note'),
      };
    case 'email':
      return { kind, to: s('to'), subject: s('subject'), body: s('body') };
    case 'tel':
      return { kind, number: s('number') };
    case 'sms':
      return { kind, number: s('number'), body: s('body') };
    case 'geo':
      // Vacío no es 0: que avise como coordenada que falta.
      return { kind, lat: s('lat').trim() ? Number(s('lat')) : NaN, lon: s('lon').trim() ? Number(s('lon')) : NaN, query: s('query') };
    case 'event': {
      const allDay = s('allDay') === 'true';
      return { kind, title: s('title'), location: s('location'), description: s('description'), allDay, start: s('start'), end: s('end') };
    }
    case 'sepa':
      return { kind, name: s('name'), iban: s('iban'), bic: s('bic'), amount: s('amount'), reference: s('reference') };
  }
}

const ERROR_TEXT: Record<BuildError, MessageKey> = {
  required: 'buildErrRequired',
  invalidUrl: 'buildErrInvalidUrl',
  unsafeScheme: 'buildErrUnsafeScheme',
  invalidPhone: 'buildErrInvalidPhone',
  invalidEmail: 'buildErrInvalidEmail',
  invalidCoords: 'buildErrInvalidCoords',
  invalidDate: 'buildErrInvalidDate',
  endBeforeStart: 'buildErrEndBeforeStart',
  wifiPasswordLength: 'buildErrWifiPasswordLength',
  ssidTooLong: 'buildErrSsidTooLong',
  invalidIban: 'buildErrInvalidIban',
  invalidBic: 'buildErrInvalidBic',
  invalidAmount: 'buildErrInvalidAmount',
  tooLong: 'buildErrTooLong',
};

// ---- Estado ----

/** Lo escrito en cada tipo se conserva al cambiar de uno a otro. */
const values: Record<BuildKind, Record<string, string>> = Object.fromEntries(KINDS.map(([k]) => [k, {}])) as Record<BuildKind, Record<string, string>>;
values.wifi.security = 'WPA';
/** Campos que el usuario ya ha tocado: a los demás no se les marca «Obligatorio» antes de tiempo. */
const touched = new Set<string>();
let kind: BuildKind = 'url';

for (const [k, label] of KINDS) {
  const option = el('option', '', t(label)) as HTMLOptionElement;
  option.value = k;
  kindSelect.append(option);
}

// Relleno desde la URL de la página (el popup abre `create.html?type=url&url=…`). Solo la extensión puede abrir
// esta página (no es accesible desde las webs), y aun así todo pasa por los mismos constructores y comprobaciones.
const params = new URLSearchParams(location.search);
const wanted = params.get('type');
if (KINDS.some(([k]) => k === wanted)) kind = wanted as BuildKind;
for (const [name, value] of params) if (name !== 'type') values[kind][name] = value.slice(0, 4000);
kindSelect.value = kind;

kindSelect.addEventListener('change', () => {
  kind = kindSelect.value as BuildKind;
  touched.clear();
  renderFields();
  void update();
});

function renderFields() {
  const current = values[kind];
  const rows = new Map<string, HTMLElement>();
  const nodes: HTMLElement[] = [];
  for (const spec of fieldsFor(kind, current)) {
    const field = renderField(spec, current);
    if (!spec.row) {
      nodes.push(field);
      continue;
    }
    let row = rows.get(spec.row);
    if (!row) {
      row = el('div', 'row');
      rows.set(spec.row, row);
      nodes.push(row);
    }
    row.append(field);
  }
  fieldsBox.replaceChildren(...nodes);
}

function renderField(spec: FieldSpec, current: Record<string, string>): HTMLElement {
  const type = spec.type ?? 'text';
  const label = el('label', type === 'checkbox' ? 'field check-field' : 'field');
  const id = `f-${spec.name}`;
  let input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  if (type === 'textarea') {
    input = el('textarea') as HTMLTextAreaElement;
    input.value = v(current, spec.name);
  } else if (type === 'select') {
    input = el('select') as HTMLSelectElement;
    for (const [value, text] of spec.options ?? []) {
      const option = el('option', '', t(text)) as HTMLOptionElement;
      option.value = value;
      input.append(option);
    }
    input.value = v(current, spec.name) || (spec.options?.[0]?.[0] ?? '');
  } else {
    input = el('input') as HTMLInputElement;
    input.type = type;
    if (type === 'checkbox') input.checked = v(current, spec.name) === 'true';
    else input.value = v(current, spec.name);
    if (type === 'number') input.step = 'any';
    if (type === 'password') input.autocomplete = 'off';
  }
  input.id = id;
  input.name = spec.name;
  input.spellcheck = type === 'textarea';
  const read = () => (input instanceof HTMLInputElement && input.type === 'checkbox' ? String(input.checked) : input.value);
  input.addEventListener('input', () => {
    current[spec.name] = read();
    touched.add(spec.name);
    void update();
  });
  // Cambiar la seguridad del wifi o «Todo el día» cambia los campos que se muestran.
  if (spec.name === 'security' || spec.name === 'allDay') {
    input.addEventListener('change', () => {
      current[spec.name] = read();
      if (spec.name === 'allDay') convertEventDates(current);
      renderFields();
      $(id).focus();
      void update();
    });
  }

  const error = el('p', 'error');
  error.id = `${id}-error`;
  error.hidden = true;
  input.setAttribute('aria-describedby', error.id);
  const caption = el('span', '', t(spec.label));
  if (type === 'checkbox') label.append(input, caption);
  else label.append(caption, input);
  label.append(error);
  if (spec.note) label.append(el('p', 'note', t(spec.note)));
  return label;
}

// Al pasar a «Todo el día» y al revés, se conserva el día (y se pone una hora razonable).
function convertEventDates(current: Record<string, string>) {
  for (const name of ['start', 'end']) {
    const value = v(current, name);
    if (!value) continue;
    current[name] = current.allDay === 'true' ? value.slice(0, 10) : value.length === 10 ? `${value}T${name === 'start' ? '09:00' : '10:00'}` : value;
  }
}

function showError(field: string | null, error: BuildError | null) {
  for (const node of fieldsBox.querySelectorAll<HTMLElement>('.error')) {
    node.hidden = true;
    node.textContent = '';
  }
  for (const node of fieldsBox.querySelectorAll('[aria-invalid]')) node.removeAttribute('aria-invalid');
  if (!field || !error) return;
  const input = document.getElementById(`f-${field}`);
  const node = document.getElementById(`f-${field}-error`);
  if (!input || !node) return;
  input.setAttribute('aria-invalid', 'true');
  node.textContent = t(ERROR_TEXT[error]);
  node.hidden = false;
}

// ---- Código, comprobación y exportación ----

/** Logo ya redibujado por nosotros: en el canvas se usa `image`; en el SVG, `href` (un PNG nuestro en data:). */
interface Logo {
  image: HTMLCanvasElement;
  href: string;
  width: number;
  height: number;
}

let logo: Logo | null = null;
const MAX_LOGO_BYTES = 5 * 1024 * 1024;
/** El logo se redibuja a este lado como mucho: basta para 2048 px y el SVG no crece sin necesidad. */
const LOGO_SIDE = 512;

const clamp = (n: number, min: number, max: number, fallback: number) => (Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : fallback);

/** Con logo, siempre H: es lo que deja leer el código aunque tape el centro. */
const ecLevel = (): EcLevel => (logo ? 'H' : (ecSelect.value as EcLevel));

function drawOptions(matrix: QrMatrix): DrawOptions {
  const margin = clamp(Number(marginInput.value), 0, 10, 4);
  const size = clamp(Number(sizeInput.value), 128, 2048, 512);
  // Módulos de píxeles enteros (nítidos): el tamaño final se acerca al pedido sin pasarse de 2048.
  const scale = Math.max(1, Math.min(Math.round(size / (matrix.size + 2 * margin)), Math.floor(2048 / (matrix.size + 2 * margin))));
  return { scale, margin, fg: fgInput.value, bg: bgInput.value, logoRatio: logo ? clamp(Number(logoSize.value), 10, 30, 22) / 100 : 0 };
}

/** Lo último que se dibujó y se comprobó; las descargas usan esto, nunca un estado a medias. */
let ready: { text: string; matrix: QrMatrix; png: Blob; options: DrawOptions; logo: Logo | null } | null = null;
/** Cada cambio invalida los anteriores que sigan en marcha. */
let generation = 0;

function setCheck(state: 'idle' | 'checking' | 'ok' | 'bad', text: string) {
  check.className = `check ${state === 'checking' ? 'idle' : state}`;
  check.textContent = text;
  const enabled = state === 'ok';
  for (const button of [pngButton, svgButton, copyButton]) button.disabled = !enabled;
  report(state);
}

/** Solo en la build E2E: Firefox no deja que geckodriver mire esta página, así que el estado se deja en storage. */
function report(state: string) {
  if (__E2E__) void browser.storage.local.set({ e2eCreateState: { state, text: ready?.text ?? null } });
}

function clearPreview(message: MessageKey, state: 'idle' | 'bad' = 'idle') {
  ready = null;
  canvas.hidden = true;
  contentBox.hidden = true;
  sizeActual.textContent = '';
  setCheck(state, t(message));
}

async function update() {
  const run = ++generation;
  const result = buildContent(toInput(kind, values[kind]));
  if (!result.ok) {
    // «Obligatorio» solo en campos ya tocados; lo demás (formato inválido) se dice siempre.
    const quiet = result.error === 'required' && !touched.has(result.field);
    showError(quiet ? null : result.field, quiet ? null : result.error);
    clearPreview('createEmpty');
    return;
  }
  showError(null, null);
  const text = result.text;
  setCheck('checking', t('createChecking'));

  let matrix: QrMatrix;
  try {
    matrix = await encodeQr(text, ecLevel());
  } catch (e) {
    if (run !== generation) return;
    if (!(e instanceof QrTooLongError)) console.error(e);
    clearPreview(e instanceof QrTooLongError ? 'createTooLong' : 'generateError', 'bad');
    return;
  }
  if (run !== generation) return;

  const options = drawOptions(matrix);
  const usedLogo = logo;
  const side = pixelSize(matrix, options);
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  drawToCanvas(ctx, matrix, options, usedLogo?.image);
  canvas.hidden = false;
  sizeActual.textContent = t('createSizeActual', side);
  content.textContent = text;
  contentBox.hidden = false;
  ready = null;

  // Se lee el canvas tal cual (colores, logo...) con el mismo lector que usa Mirilla para leer.
  const codes = await decodeImageData(ctx.getImageData(0, 0, side, side)).catch(() => []);
  if (run !== generation) return;
  if (!codes.some((c) => c.text === text)) {
    setCheck('bad', t('createNotVerified'));
    return;
  }
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (run !== generation) return;
  if (!png) {
    setCheck('bad', t('generateError'));
    return;
  }
  ready = { text, matrix, png, options, logo: usedLogo };
  setCheck('ok', t('createVerified'));
}

function fileName(ext: string): string {
  if (kind === 'url' && ready) {
    try {
      return `qr-${new URL(ready.text).hostname}.${ext}`;
    } catch {
      /* no es una URL */
    }
  }
  return `qr-${kind}.${ext}`;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = el('a') as HTMLAnchorElement;
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

pngButton.addEventListener('click', () => {
  if (ready) download(ready.png, fileName('png'));
});

svgButton.addEventListener('click', () => {
  if (!ready) return;
  const svg = buildSvg(document, ready.matrix, ready.options, ready.logo ?? undefined);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}`;
  download(new Blob([xml], { type: 'image/svg+xml' }), fileName('svg'));
});

copyButton.addEventListener('click', async () => {
  if (!ready) return;
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': ready.png })]);
    copyButton.textContent = t('copied');
  } catch {
    copyButton.textContent = t('copyFailed');
  }
  setTimeout(() => (copyButton.textContent = t('copyImage')), 1400);
});

// ---- Opciones y logo ----

function updateColorNote() {
  const state = checkColors(fgInput.value, bgInput.value);
  colorNote.hidden = state === 'ok' || state === 'invalid';
  colorNote.textContent = state === 'inverted' ? t('colorInverted') : state === 'lowContrast' ? t('colorLowContrast') : '';
}

for (const input of [ecSelect, sizeInput, fgInput, bgInput, marginInput, logoSize]) {
  input.addEventListener('input', () => {
    updateColorNote();
    void update();
  });
}

/** Nivel elegido antes de poner el logo, para volver a él al quitarlo. */
let ecBeforeLogo: string | null = null;

function setLogo(next: Logo | null) {
  // El selector muestra el nivel que se usa de verdad: con logo, la máxima (H).
  if (next && !logo) {
    ecBeforeLogo = ecSelect.value;
    ecSelect.value = 'H';
  } else if (!next && logo && ecBeforeLogo) {
    ecSelect.value = ecBeforeLogo;
    ecBeforeLogo = null;
  }
  logo = next;
  logoRemove.hidden = !next;
  logoSizeField.hidden = !next;
  logoNote.hidden = !next;
  ecSelect.disabled = !!next;
  if (next) logoSize.value = String(Math.round(DEFAULT_LOGO_RATIO * 100));
  void update();
}

function showLogoError(message: MessageKey | null) {
  logoError.hidden = !message;
  logoError.textContent = message ? t(message) : '';
}

// Solo PNG, JPG o WebP, mirando los primeros bytes (no la extensión ni el tipo que diga el sistema). Sin SVG:
// un SVG es un documento con su propio código, y aquí solo hace falta una imagen.
async function isRasterImage(file: File): Promise<boolean> {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const jpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const webp = String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP';
  return png || jpeg || webp;
}

async function loadLogo(file: File) {
  showLogoError(null);
  if (file.size > MAX_LOGO_BYTES) return showLogoError('logoTooLarge');
  if (!(await isRasterImage(file))) return showLogoError('logoInvalid');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return showLogoError('logoInvalid');
  }
  // Se redibuja en un canvas nuestro: el SVG lleva este PNG, sin metadatos ni nada más del fichero original.
  const fit = Math.min(1, LOGO_SIDE / Math.max(bitmap.width, bitmap.height));
  const image = document.createElement('canvas');
  image.width = Math.max(1, Math.round(bitmap.width * fit));
  image.height = Math.max(1, Math.round(bitmap.height * fit));
  image.getContext('2d')!.drawImage(bitmap, 0, 0, image.width, image.height);
  bitmap.close();
  setLogo({ image, href: image.toDataURL('image/png'), width: image.width, height: image.height });
}

logoInput.addEventListener('change', () => {
  const chosen = logoInput.files?.[0];
  logoInput.value = '';
  if (chosen) void loadLogo(chosen);
});
logoInput.parentElement!.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    logoInput.click();
  }
});
logoRemove.addEventListener('click', () => {
  showLogoError(null);
  setLogo(null);
});

// Los campos que llegan rellenos cuentan como tocados: si la URL del popup no vale, que se diga.
for (const name of Object.keys(values[kind])) touched.add(name);
renderFields();
(fieldsBox.querySelector('input, textarea, select') as HTMLElement | null)?.focus();
void update();
