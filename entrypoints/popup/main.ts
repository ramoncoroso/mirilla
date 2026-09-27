import { browser } from 'wxt/browser';
import { decodeBlob, type Code } from '@/lib/decode';
import { t } from '@/lib/i18n';
import type { MessageKey } from '@/locales/messages';
import { addToHistory, clearHistory, getHistory, isHistoryEnabled, setHistoryEnabled } from '@/lib/history';
import type { FromPopup } from '@/lib/messages';
import { copyText, el, renderCodes, RESULT_CSS, THEME_CSS, THEME_DARK_CSS } from '@/lib/render';
import { analyzeUrl } from '@/lib/url-safety';

// getUILanguage() puede no coincidir con la traducción que el navegador eligió; esta sí.
document.documentElement.lang = t('lang');
for (const node of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
  node.textContent = t(node.dataset.i18n as MessageKey);
}

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
  copy: (text: string) => copyText(text),
};

function setStatus(text: string | null) {
  status.hidden = !text;
  status.textContent = text ?? '';
}

function showCodes(codes: Code[]) {
  results.replaceChildren();
  if (codes.length === 0) {
    setStatus(t('noCodesShort'));
    return;
  }
  setStatus(null);
  results.append(renderCodes(codes, actions));
}

async function activeTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function decodeAndShow(blob: Blob, source: string) {
  setStatus(t('reading'));
  results.replaceChildren();
  try {
    const codes = await decodeBlob(blob);
    showCodes(codes);
    await addToHistory(codes, source);
    void renderHistory();
  } catch (e) {
    console.error(e);
    setStatus(t('readError'));
  }
}

// ---- Acciones sobre la pestaña ----

$('select').addEventListener('click', async () => {
  const tab = await activeTab();
  if (!tab?.id) return;
  await browser.runtime.sendMessage({ type: 'start-selection', tabId: tab.id } satisfies FromPopup);
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
    btn.title = entry.text;
    btn.append(el('span', 'qr-badge', entry.format), el('span', 'h-text', entry.text), el('span', 'h-when', timeAgo(entry.at)));
    btn.addEventListener('click', () => {
      showCodes([entry]);
      window.scrollTo({ top: 0 });
    });
    li.append(btn);
    historyList.append(li);
  }
}

historyEnabled.addEventListener('change', async () => {
  await setHistoryEnabled(historyEnabled.checked);
  void renderHistory();
});
$('history-clear').addEventListener('click', async () => {
  await clearHistory();
  void renderHistory();
});

function timeAgo(at: number) {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return t('timeNow');
  if (s < 3600) return t('timeMinutes', Math.floor(s / 60));
  if (s < 86400) return t('timeHours', Math.floor(s / 3600));
  return new Date(at).toLocaleDateString();
}

// ---- Arranque ----

void (async () => {
  historyEnabled.checked = await isHistoryEnabled();
  void renderHistory();
  const commands = await browser.commands.getAll();
  const shortcut = commands.find((c) => c.name === 'select-region')?.shortcut;
  if (shortcut) $('shortcut').textContent = shortcut;
})();

declare const __E2E__: boolean;
if (__E2E__) void import('@/lib/e2e-bridge').then((m) => m.mount());
