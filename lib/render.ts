// Renderiza resultados como DOM plano. Se usa en el popup y en el panel que se
// inyecta en la página (dentro de un shadow root), así que no depende de ningún framework.
// Todo el contenido del código se inserta como texto: nunca como HTML.

import type { MessageKey } from '@/locales/messages';
import type { Code } from './decode';
import { stripTrackers } from './data/trackers';
import { NEW_DOMAIN_DAYS, type DomainAge } from './rdap';
import { gtinPrefix, ISO_COUNTRY, ISO_CURRENCY, parseGs1Date, type Gs1Element } from './gs1';
import { t } from './i18n';
import { parseCode, type EventTime, type Parsed } from './parse';
import { revealHidden } from './unicode';
import { highlightRange, type Finding } from './url-safety';
import { assess, DEFAULT_CONTEXT, worst, type AssessContext, type Assessment, type LinkCheck, type Verdict } from './verdict';

export interface RenderActions {
  openUrl(url: string): void;
  copy(text: string): Promise<void>;
  /** «Investigar más»: antigüedad del dominio por RDAP (solo si el usuario lo pulsa). */
  investigate?(domain: string): Promise<DomainAge>;
}

export function renderCodes(codes: Code[], actions: RenderActions, ctx: AssessContext = DEFAULT_CONTEXT): HTMLElement {
  const list = el('div', 'qr-list');
  for (const code of codes) list.append(renderCode(code, actions, ctx));
  return list;
}

/**
 * Resultados de un PDF, por página: las páginas con algo peligroso, primero (luego Precaución), y dentro de cada
 * grupo, en orden de página.
 */
export function renderPdfPages(pages: { page: number; codes: Code[] }[], actions: RenderActions, ctx: AssessContext = DEFAULT_CONTEXT): HTMLElement {
  const rank = (codes: Code[]) => ['danger', 'caution'].indexOf(worst(...codes.map((c) => assess(c, ctx).verdict))) >>> 0;
  const list = el('div', 'qr-pdf');
  for (const { page, codes } of [...pages].sort((a, b) => rank(a.codes) - rank(b.codes) || a.page - b.page)) {
    const section = el('section', 'qr-pdf-page');
    section.dataset.page = String(page);
    section.append(el('h3', 'qr-pdf-title', t('pdfPage', page)), renderCodes(codes, actions, ctx));
    list.append(section);
  }
  return list;
}

export function renderCode(code: Code, actions: RenderActions, ctx: AssessContext = DEFAULT_CONTEXT): HTMLElement {
  const parsed = parseCode(code);
  const assessment = assess(code, ctx, parsed);
  const card = el('article', 'qr-card');
  card.dataset.verdict = assessment.verdict;
  const head = el('header', 'qr-head');
  const kind = parsed.kind === 'url' && parsed.gs1 ? 'kindDigitalLink' : KIND_LABEL[parsed.kind];
  head.append(el('span', 'qr-badge', code.format), el('span', 'qr-kind', t(kind)));
  card.append(head, renderVerdict(assessment));
  card.append(renderBody(parsed, code, assessment, actions, ctx.cleanLinks !== false));
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
  event: 'kindEvent',
  otp: 'kindOtp',
  crypto: 'kindCrypto',
  gs1: 'kindGs1',
  product: 'kindProduct',
};

const VERDICT_ICON: Record<Verdict, string> = { danger: '⛔', caution: '⚠️', clear: 'ℹ️', trusted: '✅' };
const VERDICT_LABEL: Record<Verdict, MessageKey> = {
  danger: 'verdictDanger',
  caution: 'verdictCaution',
  clear: 'verdictClear',
  trusted: 'verdictTrusted',
};

/**
 * Veredicto único arriba de cada resultado: icono y etiqueta de texto (no solo color). Sin riesgo, nunca «Seguro»:
 * el dominio real en grande y la pregunta de si es el que se esperaba, la mejor defensa contra un QR pegado encima.
 */
function renderVerdict(as: Assessment): HTMLElement {
  const box = el('div', `qr-verdict qr-verdict-${as.verdict}`);
  const title = el('p', 'qr-verdict-title');
  title.append(el('span', 'qr-verdict-icon', VERDICT_ICON[as.verdict]), el('strong', 'qr-verdict-label', t(VERDICT_LABEL[as.verdict])));
  title.firstElementChild!.setAttribute('aria-hidden', 'true');
  box.append(title);
  const link = as.link?.report;
  if (as.verdict === 'trusted') {
    const trusted = [as.link, ...as.embedded].find((l) => l?.verdict === 'trusted');
    if (trusted) box.append(el('p', 'qr-verdict-detail', t('verdictTrustedDetail', trusted.report.domain)));
  } else if (as.verdict === 'clear' && link?.openable && link.host) {
    // «Vas a $1. ¿…?» con el dominio resaltado: se parte el texto traducido por la sustitución.
    const MARK = '\uE000'; // carácter de uso privado: getMessage quita los de control
    const [before = '', after = ''] = t('verdictGoingTo', MARK).split(MARK);
    const detail = el('p', 'qr-verdict-detail');
    detail.append(before, el('strong', 'qr-verdict-domain', link.domain || link.host), after);
    box.append(detail, el('p', 'qr-verdict-limits', t('verdictLimits')));
  }
  return box;
}

function renderBody(p: Parsed, code: Code, as: Assessment, a: RenderActions, clean: boolean): HTMLElement {
  const body = el('div', 'qr-body');
  const buttons = el('div', 'qr-actions');
  // Los avisos del contenido (invisibles, teléfono, WiFi, IBAN, GS1...) van arriba, antes de los datos.
  body.append(...findingsList(as.findings));

  switch (p.kind) {
    case 'url': {
      // Un Digital Link muestra primero sus datos GS1 y después el análisis de la URL, como cualquier enlace.
      if (p.gs1) renderGs1(body, p.gs1);
      if (as.link) {
        // Los caracteres ocultos se avisan en el contenido, pero también hacen peligroso el enlace.
        const dangerous = as.link.verdict === 'danger' || as.findings.some((f) => f.message === 'hiddenChars');
        // El «es uno de tus sitios de confianza» ya lo dice el veredicto.
        const shown = as.verdict === 'trusted' ? as.link.findings.filter((f) => f.message !== 'verdictTrustedDetail') : as.link.findings;
        body.append(renderUrl(as.link.report.href, as.link.report.host), ...findingsList(shown));
        if (as.link.report.openable) {
          const target = cleanTarget(as.link, clean);
          if (target.note) body.append(target.note);
          buttons.append(openButton(target.href, dangerous ? 'danger' : as.link.verdict, a));
          if (dangerous || target.note) buttons.append(copyButton(t('copyLink'), target.href, a));
          if (dangerous || as.link.verdict === 'caution') buttons.append(...reportButtons(as.link.report.href, a));
          if (a.investigate && as.link.report.domain && as.verdict !== 'trusted') {
            // Un dominio recién registrado sube el veredicto a Precaución (como mínimo) y quita el destacado de «Abrir».
            const onNewDomain = () => {
              const card = body.closest<HTMLElement>('.qr-card');
              const raised = worst(as.verdict, 'caution');
              if (!card || raised === as.verdict) return;
              card.dataset.verdict = raised;
              card.querySelector('.qr-verdict')?.replaceWith(renderVerdict({ ...as, verdict: raised }));
              buttons.querySelector('.qr-btn-primary')?.classList.remove('qr-btn-primary');
            };
            body.append(investigateBox(as.link.report.domain, a.investigate, onNewDomain));
          }
        }
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
      body.append(el('p', 'qr-finding qr-info', t('sepaWarning')));
      buttons.append(copyButton(t('copyIban'), p.iban, a));
      break;
    case 'text':
      body.append(el('pre', 'qr-text', revealHidden(p.text)));
      break;
    case 'gs1': {
      renderGs1(body, p.elements);
      const gtin = p.elements.find((e) => e.ai === '01');
      if (gtin) buttons.append(copyButton(t('copyGtin'), gtin.value, a));
      break;
    }
    case 'event':
      body.append(
        dl([
          [t('fieldTitle'), p.title],
          [t('fieldStart'), p.start ? formatEventTime(p.start) : ''],
          [t('fieldEnd'), p.end ? formatEventTime(p.end) : ''],
          [t('fieldPlace'), p.location],
          [t('fieldDescription'), p.description],
        ]),
      );
      buttons.append(icsButton(p.ics, p.title));
      break;
    case 'otp':
      body.append(
        dl([
          [t('fieldIssuer'), p.issuer],
          [t('fieldAccount'), p.account],
          [t('fieldCodes'), p.type === 'totp' ? t('otpCodes', p.digits, p.period, p.algorithm) : t('otpCounter', p.digits, p.algorithm)],
        ]),
        secretRow(p.secret),
      );
      break;
    case 'crypto': {
      const unit = p.coin === 'bitcoin' ? ' BTC' : p.coin === 'ethereum' ? ' wei' : '';
      body.append(
        dl([
          [t('fieldNetwork2'), CRYPTO_NAME[p.coin]],
          [t('fieldAddress'), p.address],
          [t('fieldAmount'), p.amount ? `${p.amount}${unit}` : ''],
          [t('fieldLabel'), p.label],
          [t('fieldMessage'), p.message],
        ]),
      );
      if (p.addressValid !== false) buttons.append(copyButton(t('copyAddress'), p.address, a));
      break;
    }
    case 'product':
      body.append(dl([[t('gs1Gtin'), p.gtin], ...prefixRow(p.gtin)]));
      if (isCountryPrefix(p.gtin)) body.append(el('p', 'qr-note', t('gs1PrefixNote')));
      break;
  }

  // Enlaces escondidos en el contenido, cada uno con su análisis y su botón.
  if (as.embedded.length > 0) {
    const box = el('section', 'qr-embedded');
    box.append(el('h3', 'qr-embedded-title', t('embeddedLinks')));
    for (const link of as.embedded) {
      const item = el('div', 'qr-embedded-link');
      item.append(...renderLink(link));
      if (link.report.openable) {
        const target = cleanTarget(link, clean);
        if (target.note) item.append(target.note);
        const row = el('div', 'qr-actions');
        row.append(openButton(target.href, link.verdict, a), copyButton(t('copyLink'), target.href, a));
        if (link.verdict === 'danger' || link.verdict === 'caution') row.append(...reportButtons(link.report.href, a));
        item.append(row);
      }
      box.append(item);
    }
    body.append(box);
  }

  // En 2FA no: el contenido lleva la clave secreta, que va oculta.
  if (p.kind !== 'otp') buttons.append(copyButton(p.kind === 'text' ? t('copy') : t('copyContent'), code.text, a));
  body.append(buttons);
  return body;
}

/** La URL normalizada (la que abrirá el navegador: %70aypal.com → paypal.com, punycode...) y sus avisos. */
function renderLink(link: LinkCheck): HTMLElement[] {
  return [renderUrl(link.report.href, link.report.host), ...findingsList(link.findings)];
}

/** Avisos a la vista; las notas informativas, plegadas debajo (evita la fatiga de avisos). */
function findingsList(findings: readonly Finding[]): HTMLElement[] {
  const finding = (f: Finding) => el('p', `qr-finding qr-${f.level}`, t(f.message, ...(f.args ?? [])));
  const notes = findings.filter((f) => f.level === 'info');
  const shown = findings.filter((f) => f.level !== 'info').map(finding);
  if (notes.length === 0) return shown;
  const more = el('details', 'qr-more');
  more.append(el('summary', '', t('detailsMore', notes.length)), ...notes.map(finding));
  return [...shown, more];
}

const CRYPTO_NAME = { bitcoin: 'Bitcoin', ethereum: 'Ethereum', lightning: 'Lightning (Bitcoin)' } as const;

/** Fecha de un evento en el idioma de la interfaz. Con zona (TZID), la hora de esa zona y su nombre. */
export function formatEventTime(time: EventTime): string {
  const lang = t('lang');
  if (time.allDay) return new Intl.DateTimeFormat(lang, { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${time.iso}T00:00:00Z`));
  if (time.tz === 'UTC') return new Intl.DateTimeFormat(lang, { dateStyle: 'full', timeStyle: 'short' }).format(new Date(time.iso));
  // Hora de pared de otra zona (o flotante): se muestra tal cual, con la zona al lado.
  const wall = new Intl.DateTimeFormat(lang, { dateStyle: 'full', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(`${time.iso}Z`));
  return time.tz ? `${wall} (${time.tz})` : wall;
}

/** «Añadir al calendario»: descarga un .ics generado en local (el propio evento leído). */
function icsButton(ics: string, title: string): HTMLElement {
  const link = el('a', 'qr-btn qr-btn-primary', t('addToCalendar')) as HTMLAnchorElement;
  link.download = `${(title || 'evento').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().slice(0, 60) || 'evento'}.ics`;
  link.href = '#';
  link.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    link.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  });
  return link;
}

/** La clave de 2FA, oculta por defecto: quien mira la pantalla no debe poder copiarla. */
function secretRow(secret: string): HTMLElement {
  const row = el('div', 'qr-secret');
  const value = el('code', 'qr-secret-value', '•'.repeat(Math.min(secret.length, 16)));
  const toggle = button(t('showSecret'), () => {
    const shown = toggle.dataset.shown !== 'true';
    toggle.dataset.shown = String(shown);
    value.textContent = shown ? secret : '•'.repeat(Math.min(secret.length, 16));
    toggle.textContent = t(shown ? 'hideSecret' : 'showSecret');
    toggle.setAttribute('aria-label', `${toggle.textContent} — ${t('fieldSecret')}`);
  });
  toggle.setAttribute('aria-label', `${t('showSecret')} — ${t('fieldSecret')}`);
  row.append(el('span', 'qr-secret-label', t('fieldSecret')), value, toggle);
  return row;
}

/** Lo que se abre o copia: el enlace sin parámetros de rastreo (si está activado), con una nota de lo que se quita. */
function cleanTarget(link: LinkCheck, clean: boolean): { href: string; note?: HTMLElement } {
  if (!clean) return { href: link.report.href };
  const { href, removed } = stripTrackers(link.report.href);
  return removed.length ? { href, note: el('p', 'qr-note qr-trackers', t('trackersRemoved', removed.join(', '))) } : { href };
}

/** «Investigar más»: explica antes qué se consulta y a quién; el resultado aparece debajo. */
function investigateBox(domain: string, investigate: (domain: string) => Promise<DomainAge>, onNewDomain: () => void): HTMLElement {
  const box = el('div', 'qr-investigate');
  const result = el('div', 'qr-investigate-result');
  result.setAttribute('aria-live', 'polite');
  const go = button(t('investigateMore'), async () => {
    go.disabled = true;
    go.textContent = t('investigating');
    const age = await investigate(domain);
    result.replaceChildren(investigateResult(age));
    go.remove();
    if (age.status === 'ok' && age.days < NEW_DOMAIN_DAYS) onNewDomain();
  });
  box.append(go, el('p', 'qr-note', t('investigateExplain', domain)), result);
  return box;
}

function investigateResult(age: DomainAge): HTMLElement {
  if (age.status === 'error') return el('p', 'qr-finding qr-info', t('investigateError'));
  if (age.status === 'unavailable') return el('p', 'qr-finding qr-info', t('investigateUnavailable'));
  const date = new Intl.DateTimeFormat(t('lang'), { dateStyle: 'medium' }).format(new Date(age.registered));
  return age.days < NEW_DOMAIN_DAYS
    ? el('p', 'qr-finding qr-warn qr-domain-new', t('investigateNew', age.days, date))
    : el('p', 'qr-finding qr-info qr-domain-age', t('investigateAge', date, age.days.toLocaleString(t('lang'))));
}

/** Formulario de denuncia de Google Safe Browsing (no admite la URL ya rellena: se copia para pegarla). */
const SAFE_BROWSING_REPORT = 'https://safebrowsing.google.com/safebrowsing/report_phish/';
/** Buzón de incidentes de INCIBE (https://www.incibe.es/ciudadania/ayuda/reporte-de-fraude). */
const INCIBE_MAIL = 'incidencias@incibe-cert.es';

/** «Denunciar»: solo si el usuario lo pulsa; nada se envía solo. En castellano, también el aviso a INCIBE. */
function reportButtons(href: string, a: RenderActions): HTMLElement[] {
  const report = button(t('reportLink'), async () => {
    try {
      await a.copy(href);
      flash(report, t('reportCopied'));
    } catch {
      /* sin portapapeles, el formulario se abre igualmente */
    }
    a.openUrl(`${SAFE_BROWSING_REPORT}?hl=${encodeURIComponent(t('lang'))}`);
  });
  if (t('lang') !== 'es') return [report];
  const mail = el('a', 'qr-btn', t('reportIncibe')) as HTMLAnchorElement;
  mail.href = `mailto:${INCIBE_MAIL}?subject=${encodeURIComponent(t('reportMailSubject'))}&body=${encodeURIComponent(`${t('reportMailBody')}\n${href}`)}`;
  mail.target = '_blank';
  mail.rel = 'noopener noreferrer';
  return [report, mail];
}

/** Ventana para la segunda pulsación de «Abrir de todos modos». */
const CONFIRM_MS = 5000;

/**
 * Fricción proporcional al riesgo: sin señales, «Abrir» destacado; con Precaución, botón normal; con Peligro,
 * «Abrir de todos modos» pide una segunda pulsación (y al lado se ofrece copiar el enlace).
 */
function openButton(href: string, verdict: Verdict, a: RenderActions) {
  if (verdict !== 'danger') {
    const open = button(t('open'), () => a.openUrl(href));
    if (verdict !== 'caution') open.classList.add('qr-btn-primary');
    return open;
  }
  let armed = 0;
  const open = button(t('openAnyway'), () => {
    if (Date.now() - armed < CONFIRM_MS) {
      armed = 0;
      open.textContent = t('openAnyway');
      a.openUrl(href);
      return;
    }
    armed = Date.now();
    open.textContent = t('openConfirm');
    setTimeout(() => {
      if (armed && Date.now() - armed >= CONFIRM_MS) {
        armed = 0;
        open.textContent = t('openAnyway');
      }
    }, CONFIRM_MS);
  });
  open.classList.add('qr-btn-danger');
  return open;
}

// ---- GS1 ----

/** Lista de datos GS1 con etiquetas traducidas y valores formateados (los avisos los da verdict.ts). */
function renderGs1(body: HTMLElement, elements: Gs1Element[]) {
  const rows: [string, string][] = [];
  let prefixNote = false;
  for (const e of elements) {
    const label = e.def?.label ? t(e.def.label) : (e.def?.title ?? 'AI');
    rows.push([`${label} (${e.ai})`, formatGs1Value(e)]);
    if (e.ai === '01' || e.ai === '02') {
      rows.push(...prefixRow(e.value));
      prefixNote ||= isCountryPrefix(e.value);
    }
  }
  body.append(dl(rows));
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
.qr-verdict { margin: 0 0 8px; padding: 8px 10px; border-radius: 8px; border-left: 4px solid; }
.qr-verdict p { margin: 0; }
.qr-verdict-title { display: flex; align-items: center; gap: 6px; font-size: 14px; }
.qr-verdict-detail { margin-top: 4px !important; }
.qr-verdict-domain { font: 600 15px/1.3 ui-monospace, monospace; word-break: break-all; }
.qr-verdict-limits { margin-top: 2px !important; font-size: 11px; opacity: .85; }
.qr-verdict-danger { background: var(--qr-danger-bg); color: var(--qr-danger-fg); }
.qr-verdict-caution { background: var(--qr-warn-bg); color: var(--qr-warn-fg); }
.qr-verdict-clear { background: var(--qr-info-bg); color: var(--qr-info-fg); }
.qr-verdict-trusted { background: var(--qr-ok-bg); color: var(--qr-ok-fg); }
.qr-investigate { margin-top: 8px; }
.qr-investigate .qr-note { margin-top: 2px; }
.qr-pdf { display: flex; flex-direction: column; gap: 14px; }
.qr-pdf-title { font-size: 13px; margin: 0 0 6px; color: var(--qr-muted); }
.qr-secret { display: flex; align-items: center; gap: 8px; margin: 0 0 6px; flex-wrap: wrap; }
.qr-secret-label { color: var(--qr-muted); }
.qr-secret-value { font: 13px ui-monospace, monospace; word-break: break-all; }
.qr-more { margin: 4px 0; font-size: 12px; }
.qr-more summary { cursor: pointer; color: var(--qr-muted); }
.qr-embedded { margin-top: 8px; padding-top: 6px; border-top: 1px dashed var(--qr-border); }
.qr-embedded-title { font-size: 12px; font-weight: 600; margin: 0 0 4px; color: var(--qr-muted); }
.qr-embedded-link + .qr-embedded-link { margin-top: 8px; }
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
  --qr-ok-bg: #e6f4ea; --qr-ok-fg: #0d652d;
`;

export const THEME_DARK_CSS = `
  --qr-bg: #202124; --qr-fg: #e8eaed; --qr-muted: #9aa0a6; --qr-border: #3c4043; --qr-card: #292a2d; --qr-badge: #35363a;
  --qr-accent: #4c8df6; --qr-primary: #1967d2; --qr-highlight: #5c4b00;
  --qr-danger-bg: #4a1f1c; --qr-danger-fg: #f6aea9; --qr-warn-bg: #3f3200; --qr-warn-fg: #fdd663; --qr-info-bg: #1c2b4a; --qr-info-fg: #aecbfa;
  --qr-ok-bg: #173623; --qr-ok-fg: #a8dab5;
`;
