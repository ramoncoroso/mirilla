import { browser } from 'wxt/browser';
import { loadContextData, toAssessContext, withListed } from '@/lib/context';
import { domainAge } from '@/lib/rdap';
import { blocklistNoticeSeen, isBlocklistEnabled, markBlocklistNoticeSeen } from '@/lib/blocklist-store';
import { decodeBlob, type Code } from '@/lib/decode';
import { t } from '@/lib/i18n';
import type { MessageKey } from '@/locales/messages';
import { getHistory, isHistoryEnabled } from '@/lib/history';
import type { FromPopup } from '@/lib/messages';
import { copyText, el, renderCodes, RESULT_CSS, THEME_CSS, THEME_DARK_CSS } from '@/lib/render';
import { revealHidden } from '@/lib/unicode';
import { analyzeUrl } from '@/lib/url-safety';

// getUILanguage() puede no coincidir con la traducción que el navegador eligió; esta sí.
document.documentElement.lang = t('lang');
for (const node of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
  // Las claves vienen de popup.html; t() devuelve la propia clave si no existiera, así que se nota enseguida.
  node.textContent = t(node.dataset.i18n as MessageKey);
}

// Soltar un fichero fuera de la zona de arrastre no debe hacer que el popup navegue a él.
for (const type of ['dragover', 'drop'] as const) document.addEventListener(type, (e) => e.preventDefault());

const style = document.createElement('style');
style.textContent = `:root { ${THEME_CSS} } @media (prefers-color-scheme: dark) { :root { ${THEME_DARK_CSS} } } ${RESULT_CSS}`;
document.head.append(style);

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $('status');
const results = $('results');

const actions = {
  openUrl(url: string) {
    if (analyzeUrl(url).openable) void browser.tabs.create({ url });
  },
  // En una página de la extensión el respaldo con execCommand es seguro: ninguna web ve sus eventos.
  copy: (text: string) => copyText(text, { allowFallback: true }),
  investigate: domainAge,
};

/** El historial se escribe solo desde el background (una única cola); nunca en ventanas privadas. */
async function saveToHistory(codes: Code[], pageUrl: string) {
  if (codes.length === 0 || (await activeTab())?.incognito || browser.extension.inIncognitoContext) return;
  await browser.runtime.sendMessage({ type: 'history-add', codes, pageUrl } satisfies FromPopup);
}

function setStatus(text: string | null) {
  status.hidden = !text;
  status.textContent = text ?? '';
}

/** El contexto (sitios de confianza, dominios ya vistos) se carga antes de guardar la lectura en el historial. */
async function showCodes(codes: Code[]) {
  const base = await loadContextData().catch(() => undefined);
  const ctx = base && toAssessContext(await withListed(base, codes));
  clearResults();
  if (codes.length === 0) {
    setStatus(t('noCodesShort'));
    return;
  }
  setStatus(null);
  results.append(renderCodes(codes, actions, ctx));
}

async function activeTab() {
  // En la build E2E el popup se abre como pestaña (sería él mismo la activa): ?tab=<id> indica cuál usar.
  const forced = __E2E__ ? new URLSearchParams(location.search).get('tab') : null;
  if (forced) return browser.tabs.get(Number(forced));
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function decodeAndShow(blob: Blob, source: string) {
  setStatus(t('reading'));
  clearResults();
  try {
    const codes = await decodeBlob(blob);
    await showCodes(codes);
    await saveToHistory(codes, source);
    void renderHistory();
  } catch (e) {
    console.error(e);
    setStatus(t('readError'));
  }
}

// ---- Acciones sobre la pestaña ----

$('select').addEventListener('click', async () => {
  const tab = await activeTab();
  if (tab?.id === undefined) return;
  const started = await browser.runtime.sendMessage({ type: 'start-selection', tabId: tab.id } satisfies FromPopup);
  // En páginas protegidas no se puede seleccionar: se explica en lugar de cerrar sin más.
  if (!started) {
    setStatus(t('captureBlocked'));
    return;
  }
  // El popup tapa la página: se cierra para que se pueda arrastrar.
  window.close();
});

$('scan').addEventListener('click', async () => {
  const tab = await activeTab();
  if (!tab) return;
  try {
    const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId!, { format: 'png' });
    await decodeAndShow(await (await fetch(dataUrl)).blob(), tab.url ?? '');
  } catch (e) {
    console.error(e);
    setStatus(t('captureBlocked'));
  }
});

// ---- Generar el QR de la página actual ----

/** URL temporal de la última imagen generada; se libera al generar otra o al cerrar el popup. */
let generatedUrl: string | null = null;

function clearResults() {
  if (generatedUrl) URL.revokeObjectURL(generatedUrl);
  generatedUrl = null;
  results.replaceChildren();
}

$('generate').addEventListener('click', async () => {
  clearResults();
  const url = (await activeTab())?.url;
  if (!url || !/^https?:/.test(url)) {
    setStatus(t('generateUnavailable'));
    return;
  }
  setStatus(null);
  try {
    const { generateQr } = await import('@/lib/generate');
    showGenerated(url, await generateQr(url));
  } catch (e) {
    console.error(e);
    setStatus(t('generateError'));
  }
});

function showGenerated(url: string, png: Blob) {
  const src = URL.createObjectURL(png);
  generatedUrl = src;
  const card = el('article', 'qr-card generated');
  const img = el('img') as HTMLImageElement;
  img.src = src;
  img.alt = url;
  const download = el('a', 'qr-btn', t('downloadPng')) as HTMLAnchorElement;
  download.href = src;
  download.download = `qr-${new URL(url).hostname}.png`;
  const copy = el('button', 'qr-btn', t('copyImage')) as HTMLButtonElement;
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      copy.textContent = t('copied');
    } catch {
      copy.textContent = t('copyFailed');
    }
    setTimeout(() => (copy.textContent = t('copyImage')), 1400);
  });
  const buttons = el('div', 'qr-actions');
  buttons.append(download, copy);
  card.append(img, el('p', 'qr-url', url), buttons);
  results.append(card);
}

// ---- Imagen pegada, arrastrada o elegida ----

const drop = $('drop');
const file = $<HTMLInputElement>('file');

file.addEventListener('change', () => {
  if (file.files?.[0]) void decodeAndShow(file.files[0], '');
  file.value = '';
});
drop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    file.click();
  }
});
drop.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('over');
});
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  const f = Array.from(e.dataTransfer?.files ?? []).find((f) => f.type.startsWith('image/'));
  if (f) void decodeAndShow(f, '');
});
document.addEventListener('paste', (e) => {
  const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'));
  const blob = item?.getAsFile();
  if (blob) void decodeAndShow(blob, '');
  else setStatus(t('clipboardNoImage'));
});

// ---- Historial ----

const historyList = $('history');
const historyEnabled = $<HTMLInputElement>('history-enabled');

async function renderHistory() {
  const entries = await getHistory();
  historyList.replaceChildren();
  if (entries.length === 0) {
    historyList.append(el('li', 'history-empty', historyEnabled.checked ? t('historyEmpty') : t('historyOff')));
    return;
  }
  for (const entry of entries) {
    const li = el('li');
    const btn = el('button');
    btn.title = revealHidden(entry.text);
    btn.append(el('span', 'qr-badge', entry.format), el('span', 'h-text', revealHidden(entry.text)), el('span', 'h-when', timeAgo(entry.at)));
    btn.addEventListener('click', async () => {
      await showCodes([entry]);
      window.scrollTo({ top: 0 });
    });
    li.append(btn);
    historyList.append(li);
  }
}

historyEnabled.addEventListener('change', async () => {
  await browser.runtime.sendMessage({ type: 'history-set-enabled', enabled: historyEnabled.checked } satisfies FromPopup);
  void renderHistory();
});
$('history-clear').addEventListener('click', async () => {
  await browser.runtime.sendMessage({ type: 'history-clear' } satisfies FromPopup);
  void renderHistory();
});

function timeAgo(at: number) {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return t('timeNow');
  if (s < 3600) return t('timeMinutes', Math.floor(s / 60));
  if (s < 86400) return t('timeHours', Math.floor(s / 3600));
  return new Date(at).toLocaleDateString(t('lang'));
}

// ---- Arranque ----

void (async () => {
  historyEnabled.checked = await isHistoryEnabled();
  // Primera ejecución: se explica la lista pública (se descarga sola) hasta que el usuario lo cierra.
  if ((await isBlocklistEnabled()) && !(await blocklistNoticeSeen())) $('notice').hidden = false;
  void renderHistory();
  // Firefox para Android no tiene atajos de teclado.
  const commands = browser.commands as typeof browser.commands | undefined;
  const shortcut = (await commands?.getAll().catch(() => []))?.find((c) => c.name === 'select-region')?.shortcut;
  if (shortcut) $('shortcut').textContent = shortcut;
})();


$('notice-ok').addEventListener('click', () => {
  $('notice').hidden = true;
  void markBlocklistNoticeSeen();
});
$('settings').addEventListener('click', () => void browser.runtime.openOptionsPage());

window.addEventListener('pagehide', clearResults);
