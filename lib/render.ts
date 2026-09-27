// Renderiza resultados como DOM plano. Se usa en el popup y en el panel que se
// inyecta en la página (dentro de un shadow root), así que no depende de ningún framework.
// Todo el contenido del código se inserta como texto: nunca como HTML.

import type { MessageKey } from '@/locales/messages';
import type { Code } from './decode';
import { t } from './i18n';
import { parseContent, type Parsed } from './parse';
import { analyzeUrl, mainDomain } from './url-safety';

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
  const parsed = parseContent(code.text);
  const card = el('article', 'qr-card');
  const head = el('header', 'qr-head');
  head.append(el('span', 'qr-badge', code.format), el('span', 'qr-kind', t(KIND_LABEL[parsed.kind])));
  card.append(head, renderBody(parsed, code, actions));
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
};

function renderBody(p: Parsed, code: Code, a: RenderActions): HTMLElement {
  const body = el('div', 'qr-body');
  const buttons = el('div', 'qr-actions');

  switch (p.kind) {
    case 'url': {
      const report = analyzeUrl(p.url);
      body.append(renderUrl(p.url, report.host));
      for (const f of report.findings) body.append(el('p', `qr-finding qr-${f.level}`, t(f.message, ...(f.args ?? []))));
      if (report.openable) {
        const open = button(report.findings.some((f) => f.level === 'danger') ? t('openAnyway') : t('open'), () => a.openUrl(p.url));
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
          [t('fieldAmount'), p.amount],
          [t('fieldReference'), p.reference],
        ]),
      );
      body.append(el('p', 'qr-finding qr-info', t('sepaWarning')));
      buttons.append(copyButton(t('copyIban'), p.iban, a));
      break;
    case 'text':
      body.append(el('pre', 'qr-text', p.text));
      break;
  }

  buttons.append(copyButton(p.kind === 'text' ? t('copy') : t('copyContent'), code.text, a));
  body.append(buttons);
  return body;
}

/** Muestra la URL completa con el dominio principal resaltado, que es lo que decide adónde va. */
function renderUrl(url: string, host: string): HTMLElement {
  const box = el('p', 'qr-url');
  const main = host ? mainDomain(host) : '';
  // Busca el dominio dentro de la autoridad (antes de la ruta) y desde el final,
  // para no resaltar un "paypal.com" que esté en el usuario o en la ruta.
  const start = url.indexOf('//') + 2;
  const rest = url.slice(start);
  const authorityEnd = start + (rest.search(/[/?#]/) < 0 ? rest.length : rest.search(/[/?#]/));
  const found = main ? url.toLowerCase().lastIndexOf(main, authorityEnd - main.length) : -1;
  const idx = found >= start ? found : -1;
  if (idx < 0) {
    box.textContent = url;
  } else {
    box.append(url.slice(0, idx), el('strong', 'qr-domain', url.slice(idx, idx + main.length)), url.slice(idx + main.length));
  }
  return box;
}

function dl(rows: [string, string][]): HTMLElement {
  const list = el('dl', 'qr-dl');
  for (const [k, v] of rows) {
    if (!v) continue;
    list.append(el('dt', '', k), el('dd', '', v));
  }
  return list;
}

function copyButton(label: string, text: string, a: RenderActions) {
  const b = button(label, async () => {
    try {
      await a.copy(text);
      flash(b, t('copied'));
    } catch {
      flash(b, t('copyFailed'));
    }
  });
  return b;
}

function flash(b: HTMLButtonElement, msg: string) {
  const original = b.textContent;
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

/** Copia texto; si la API del portapapeles no está disponible (http, sin foco), usa execCommand. */
export async function copyText(text: string, root: Document | ShadowRoot = document) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    /* fallback abajo */
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
.qr-finding { margin: 4px 0; padding: 6px 8px; border-radius: 6px; font-size: 12px; line-height: 1.35; }
.qr-danger { background: var(--qr-danger-bg); color: var(--qr-danger-fg); }
.qr-warn { background: var(--qr-warn-bg); color: var(--qr-warn-fg); }
.qr-info { background: var(--qr-info-bg); color: var(--qr-info-fg); }
.qr-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.qr-btn { font: inherit; font-size: 12px; padding: 5px 10px; border-radius: 6px; border: 1px solid var(--qr-border); background: var(--qr-bg); color: var(--qr-fg); cursor: pointer; }
.qr-btn:hover { border-color: var(--qr-muted); }
.qr-btn-primary { background: var(--qr-accent); border-color: var(--qr-accent); color: #fff; }
.qr-btn-danger { background: transparent; border-color: var(--qr-danger-fg); color: var(--qr-danger-fg); }
`;

export const THEME_CSS = `
  --qr-bg: #ffffff; --qr-fg: #1a1a1a; --qr-muted: #5f6368; --qr-border: #dadce0; --qr-card: #fafafa; --qr-badge: #eceff1;
  --qr-accent: #1a73e8; --qr-highlight: #fff3b0;
  --qr-danger-bg: #fce8e6; --qr-danger-fg: #b3261e; --qr-warn-bg: #fef7e0; --qr-warn-fg: #8a5a00; --qr-info-bg: #e8f0fe; --qr-info-fg: #174ea6;
`;

export const THEME_DARK_CSS = `
  --qr-bg: #202124; --qr-fg: #e8eaed; --qr-muted: #9aa0a6; --qr-border: #3c4043; --qr-card: #292a2d; --qr-badge: #35363a;
  --qr-accent: #4c8df6; --qr-highlight: #5c4b00;
  --qr-danger-bg: #4a1f1c; --qr-danger-fg: #f6aea9; --qr-warn-bg: #3f3200; --qr-warn-fg: #fdd663; --qr-info-bg: #1c2b4a; --qr-info-fg: #aecbfa;
`;
