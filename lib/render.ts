// Renderiza resultados como DOM plano. Se usa en el popup y en el panel que se
// inyecta en la página (dentro de un shadow root), así que no depende de ningún framework.
// Todo el contenido del código se inserta como texto: nunca como HTML.

import type { MessageKey } from '@/locales/messages';
import type { Code } from './decode';
import { gtinPrefix, ISO_COUNTRY, ISO_CURRENCY, parseGs1Date, type Gs1Element } from './gs1';
import { t } from './i18n';
import { parseCode, type Parsed } from './parse';
import { hiddenChars, revealHidden } from './unicode';
import { analyzeUrl, highlightRange } from './url-safety';

export interface RenderActions {
  openUrl(url: string): void;
  copy(text: string): Promise<void>;
}

export function renderCodes(codes: Code[], actions: RenderActions): HTMLElement {
  const list = el('div', 'qr-list');
  for (const code of codes) list.append(renderCode(code, actions));
  return list;
}

export function renderCode(code: Code, actions: RenderActions): HTMLElement {
  const parsed = parseCode(code);
  const card = el('article', 'qr-card');
  const head = el('header', 'qr-head');
  const kind = parsed.kind === 'url' && parsed.gs1 ? 'kindDigitalLink' : KIND_LABEL[parsed.kind];
  head.append(el('span', 'qr-badge', code.format), el('span', 'qr-kind', t(kind)));
  card.append(head);
  // Invisibles y controles bidi hacen que el texto se vea distinto de lo que es: aviso en cualquier tipo de contenido.
  const hidden = hiddenChars(code.text);
  if (hidden.length > 0) card.append(el('p', 'qr-finding qr-danger', t('hiddenChars', hidden.join(', '))));
  card.append(renderBody(parsed, code, actions));
  return card;
}

const KIND_LABEL: Record<Parsed['kind'], MessageKey> = {
  url: 'kindUrl',
  wifi: 'kindWifi',
  email: 'kindEmail',
  tel: 'kindTel',
  sms: 'kindSms',
  geo: 'kindGeo',
  contact: 'kindContact',
  sepa: 'kindSepa',
  text: 'kindText',
  gs1: 'kindGs1',
  product: 'kindProduct',
};

function renderBody(p: Parsed, code: Code, a: RenderActions): HTMLElement {
  const body = el('div', 'qr-body');
  const buttons = el('div', 'qr-actions');

  switch (p.kind) {
    case 'url': {
      // Un Digital Link muestra primero sus datos GS1 y después el análisis de la URL, como cualquier enlace.
      if (p.gs1) renderGs1(body, p.gs1);
      const report = analyzeUrl(p.url);
      // Se muestra la URL normalizada: es la que abrirá el navegador (%70aypal.com → paypal.com, mayúsculas, punycode...).
      body.append(renderUrl(report.href, report.host));
      for (const f of report.findings) body.append(el('p', `qr-finding qr-${f.level}`, t(f.message, ...(f.args ?? []))));
      if (report.openable) {
        const open = button(report.findings.some((f) => f.level === 'danger') ? t('openAnyway') : t('open'), () => a.openUrl(report.href));
        if (report.findings.some((f) => f.level === 'danger')) open.classList.add('qr-btn-danger');
        else open.classList.add('qr-btn-primary');
        buttons.append(open);
      }
      break;
    }
    case 'wifi':
      body.append(
        dl([
          [t('fieldNetwork'), p.hidden ? t('networkHidden', p.ssid) : p.ssid],
          [t('fieldSecurity'), p.security === 'nopass' ? t('securityOpen') : p.security],
          ...(p.password ? ([[t('fieldPassword'), p.password]] as [string, string][]) : []),
        ]),
      );
      if (p.password) buttons.append(copyButton(t('copyPassword'), p.password, a));
      break;
    case 'email':
      body.append(dl([[t('fieldTo'), p.to], [t('fieldSubject'), p.subject], [t('fieldMessage'), p.body]]));
      if (p.to) buttons.append(copyButton(t('copyAddress'), p.to, a));
      break;
    case 'tel':
      body.append(dl([[t('fieldNumber'), p.number]]));
      buttons.append(copyButton(t('copyNumber'), p.number, a));
      break;
    case 'sms':
      body.append(dl([[t('fieldNumber'), p.number], [t('fieldMessage'), p.body]]));
      break;
    case 'geo': {
      body.append(dl([[t('fieldCoordinates'), `${p.lat}, ${p.lon}`], [t('fieldPlace'), p.query]]));
      const osm = `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=16/${p.lat}/${p.lon}`;
      buttons.append(button(t('viewOnMap'), () => a.openUrl(osm)));
      break;
    }
    case 'contact':
      body.append(dl([[t('fieldName'), p.name], ...p.fields.map((f) => [t(f.label), f.value] as [string, string])]));
      break;
    case 'sepa':
      body.append(
        dl([
          [t('fieldBeneficiary'), p.name],
          [t('fieldIban'), p.iban],
          [t('fieldBic'), p.bic],
          [t('fieldAmount'), p.amount ? new Intl.NumberFormat(t('lang'), { style: 'currency', currency: 'EUR' }).format(Number(p.amount)) : ''],
          [t('fieldReference'), p.reference],
        ]),
      );
      if (!p.ibanValid) body.append(el('p', 'qr-finding qr-danger', t('ibanInvalid')));
      body.append(el('p', 'qr-finding qr-info', t('sepaWarning')));
      buttons.append(copyButton(t('copyIban'), p.iban, a));
      break;
    case 'text':
      body.append(el('pre', 'qr-text', revealHidden(p.text)));
      break;
    case 'gs1': {
      renderGs1(body, p.elements);
      if (p.rest) body.append(el('p', 'qr-finding qr-info', t('gs1Unparsed', p.rest)));
      const gtin = p.elements.find((e) => e.ai === '01');
      if (gtin) buttons.append(copyButton(t('copyGtin'), gtin.value, a));
      break;
    }
    case 'product':
      body.append(dl([[t('gs1Gtin'), p.gtin], ...prefixRow(p.gtin)]));
      if (isCountryPrefix(p.gtin)) body.append(el('p', 'qr-note', t('gs1PrefixNote')));
      break;
  }

  buttons.append(copyButton(p.kind === 'text' ? t('copy') : t('copyContent'), code.text, a));
  body.append(buttons);
  return body;
}

// ---- GS1 ----

/** Lista de datos GS1 con etiquetas traducidas, valores formateados y avisos (dígito de control, caducado). */
function renderGs1(body: HTMLElement, elements: Gs1Element[]) {
  const rows: [string, string][] = [];
  const findings: HTMLElement[] = [];
  let prefixNote = false;
  for (const e of elements) {
    const label = e.def?.label ? t(e.def.label) : (e.def?.title ?? 'AI');
    rows.push([`${label} (${e.ai})`, formatGs1Value(e)]);
    if (e.ai === '01' || e.ai === '02') {
      rows.push(...prefixRow(e.value));
      prefixNote ||= isCountryPrefix(e.value);
    }
    if (e.malformed) findings.push(el('p', 'qr-finding qr-warn', t('gs1Malformed', `(${e.ai})`, e.malformed.expected, String(e.malformed.actual))));
    if (e.checkDigitOk === false) findings.push(el('p', 'qr-finding qr-danger', t('gs1BadCheckDigit', `(${e.ai})`, e.expectedCheckDigit ?? '')));
    if (e.ai === '17') {
      const d = parseGs1Date(e.value);
      if (d && d.date < startOfToday()) findings.push(el('p', 'qr-finding qr-warn', t('gs1Expired')));
    }
  }
  body.append(dl(rows), ...findings);
  if (prefixNote) body.append(el('p', 'qr-note', t('gs1PrefixNote')));
}

function formatGs1Value(e: Gs1Element): string {
  const lang = t('lang');
  const scaled = (digits: string, decimals = e.decimals ?? 0) =>
    new Intl.NumberFormat(lang, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number(digits) / 10 ** decimals);
  switch (e.def?.kind) {
    case 'date': {
      const d = parseGs1Date(e.value);
      if (!d) return e.value;
      if (d.endOfMonth) return t('gs1EndOfMonth', new Intl.DateTimeFormat(lang, { year: 'numeric', month: 'long' }).format(d.date));
      return new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(d.date);
    }
    case 'measure':
      return /^\d+$/.test(e.value) ? `${scaled(e.value)} ${e.def.unit}` : e.value;
    case 'count':
      return /^\d+$/.test(e.value) ? new Intl.NumberFormat(lang).format(Number(e.value)) : e.value;
    case 'amount':
      return /^\d+$/.test(e.value) ? scaled(e.value) : e.value;
    case 'amountIso': {
      const currency = ISO_CURRENCY[e.value.slice(0, 3)];
      const amount = e.value.slice(3);
      if (!/^\d+$/.test(amount)) return e.value;
      if (!currency) return `${scaled(amount)} (ISO 4217: ${e.value.slice(0, 3)})`;
      const decimals = e.decimals ?? 0;
      return new Intl.NumberFormat(lang, { style: 'currency', currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(
        Number(amount) / 10 ** decimals,
      );
    }
    case 'country':
      return regionName(ISO_COUNTRY[e.value]) ?? `ISO 3166: ${e.value}`;
    default:
      return e.value;
  }
}

/** Fila "Prefijo GS1: España, Andorra" para un GTIN, o nada si no aplica. */
function prefixRow(gtin: string): [string, string][] {
  const info = gtinPrefix(gtin);
  if (!info) return [];
  const value = 'special' in info ? t(info.special) : info.regions.map((r) => regionName(r) ?? r).join(', ');
  return [[t('gs1PrefixLabel'), value]];
}

/** El prefijo corresponde a un país (y no a ISBN, cupones...): entonces hay que aclarar que no es el origen. */
function isCountryPrefix(gtin: string) {
  const info = gtinPrefix(gtin);
  return !!info && 'regions' in info;
}

function regionName(code: string | undefined): string | undefined {
  if (!code) return undefined;
  try {
    return new Intl.DisplayNames([t('lang')], { type: 'region' }).of(code);
  } catch {
    return code;
  }
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Muestra la URL completa con el dominio principal resaltado, que es lo que decide adónde va. */
function renderUrl(href: string, host: string): HTMLElement {
  const box = el('p', 'qr-url');
  const range = highlightRange(href, host);
  if (!range) {
    box.textContent = revealHidden(href);
  } else {
    const [from, to] = range;
    box.append(revealHidden(href.slice(0, from)), el('strong', 'qr-domain', href.slice(from, to)), revealHidden(href.slice(to)));
  }
  return box;
}

function dl(rows: [string, string][]): HTMLElement {
  const list = el('dl', 'qr-dl');
  for (const [k, v] of rows) {
    if (!v) continue;
    list.append(el('dt', '', k), el('dd', '', revealHidden(v)));
  }
  return list;
}

function copyButton(label: string, text: string, a: RenderActions) {
  const b = button(label, async () => {
    try {
      await a.copy(text);
      flash(b, t('copied'));
    } catch (e) {
      flash(b, e instanceof UnsafeCopyError ? t('copyUnsafe') : t('copyFailed'));
    }
  });
  return b;
}

function flash(b: HTMLButtonElement, msg: string) {
  const original = b.dataset.label ?? b.textContent ?? '';
  b.dataset.label = original;
  b.textContent = msg;
  setTimeout(() => (b.textContent = original), 1400);
}

function button(label: string, onClick: () => void) {
  const b = el('button', 'qr-btn', label) as HTMLButtonElement;
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

export function el(tag: string, className = '', text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** La copia se ha negado porque solo había métodos que la página podría manipular. */
export class UnsafeCopyError extends Error {}

/**
 * Copia texto con la API del portapapeles, que no dispara eventos en la página.
 * Solo en páginas de la extensión (popup) se permite el respaldo con execCommand: dentro de una web, ese
 * método dispara un evento `copy` que la página puede interceptar para cambiar lo copiado (un IBAN, una URL...).
 */
export async function copyText(text: string, { root = document as Document | ShadowRoot, allowFallback = false } = {}) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    if (!allowFallback) throw new UnsafeCopyError();
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
  (root instanceof Document ? root.body : root).append(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  if (!ok) throw new Error('copy failed');
}

export const RESULT_CSS = `
.qr-list { display: flex; flex-direction: column; gap: 10px; }
.qr-card { border: 1px solid var(--qr-border); border-radius: 10px; padding: 10px 12px; background: var(--qr-card); }
.qr-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.qr-badge { font: 600 11px/1 ui-monospace, monospace; padding: 3px 6px; border-radius: 4px; background: var(--qr-badge); color: var(--qr-muted); }
.qr-kind { font-weight: 600; }
.qr-url { font: 13px/1.4 ui-monospace, monospace; word-break: break-all; margin: 0 0 6px; color: var(--qr-muted); }
.qr-domain { color: var(--qr-fg); background: var(--qr-highlight); border-radius: 3px; padding: 0 2px; }
.qr-text { white-space: pre-wrap; word-break: break-word; font: 13px/1.4 ui-monospace, monospace; margin: 0 0 6px; max-height: 180px; overflow: auto; }
.qr-dl { display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; margin: 0 0 6px; }
.qr-dl dt { color: var(--qr-muted); }
.qr-dl dd { margin: 0; word-break: break-word; }
.qr-note { margin: 4px 0 0; font-size: 11px; color: var(--qr-muted); }
.qr-finding { margin: 4px 0; padding: 6px 8px; border-radius: 6px; font-size: 12px; line-height: 1.35; }
.qr-danger { background: var(--qr-danger-bg); color: var(--qr-danger-fg); }
.qr-warn { background: var(--qr-warn-bg); color: var(--qr-warn-fg); }
.qr-info { background: var(--qr-info-bg); color: var(--qr-info-fg); }
.qr-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.qr-btn { font: inherit; font-size: 12px; text-decoration: none; padding: 5px 10px; border-radius: 6px; border: 1px solid var(--qr-border); background: var(--qr-bg); color: var(--qr-fg); cursor: pointer; }
.qr-btn:hover { border-color: var(--qr-muted); }
/* Color propio para el botón principal: texto blanco con contraste ≥ 4.5:1 (WCAG AA) en los dos temas. */
.qr-btn-primary { background: var(--qr-primary); border-color: var(--qr-primary); color: #fff; }
.qr-btn-danger { background: transparent; border-color: var(--qr-danger-fg); color: var(--qr-danger-fg); }
`;

export const THEME_CSS = `
  --qr-bg: #ffffff; --qr-fg: #1a1a1a; --qr-muted: #5f6368; --qr-border: #dadce0; --qr-card: #fafafa; --qr-badge: #eceff1;
  --qr-accent: #1a73e8; --qr-primary: #1967d2; --qr-highlight: #fff3b0;
  --qr-danger-bg: #fce8e6; --qr-danger-fg: #b3261e; --qr-warn-bg: #fef7e0; --qr-warn-fg: #8a5a00; --qr-info-bg: #e8f0fe; --qr-info-fg: #174ea6;
`;

export const THEME_DARK_CSS = `
  --qr-bg: #202124; --qr-fg: #e8eaed; --qr-muted: #9aa0a6; --qr-border: #3c4043; --qr-card: #292a2d; --qr-badge: #35363a;
  --qr-accent: #4c8df6; --qr-primary: #1967d2; --qr-highlight: #5c4b00;
  --qr-danger-bg: #4a1f1c; --qr-danger-fg: #f6aea9; --qr-warn-bg: #3f3200; --qr-warn-fg: #fdd663; --qr-info-bg: #1c2b4a; --qr-info-fg: #aecbfa;
`;
