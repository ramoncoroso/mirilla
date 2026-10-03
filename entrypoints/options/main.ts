import { browser } from 'wxt/browser';
import { blocklistInfo, isBlocklistEnabled, setBlocklistEnabled } from '@/lib/blocklist-store';
import type { FromPopup } from '@/lib/messages';
import { addTrustedSite, getCleanLinks, getTrustedSites, removeTrustedSite, setCleanLinks } from '@/lib/context';
import { t } from '@/lib/i18n';
import type { MessageKey } from '@/locales/messages';
import { el, RESULT_CSS, THEME_CSS, THEME_DARK_CSS } from '@/lib/render';

document.documentElement.lang = t('lang');
document.title = t('optionsTitle');
for (const node of document.querySelectorAll<HTMLElement>('[data-i18n]')) node.textContent = t(node.dataset.i18n as MessageKey);

const style = document.createElement('style');
style.textContent = `:root { ${THEME_CSS} } @media (prefers-color-scheme: dark) { :root { ${THEME_DARK_CSS} } } ${RESULT_CSS}`;
document.head.append(style);

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>('trusted-form');
const input = $<HTMLInputElement>('trusted-input');
const status = $('trusted-status');
const list = $('trusted-list');

input.placeholder = t('trustedPlaceholder');
input.setAttribute('aria-label', t('trustedTitle'));

async function renderSites() {
  const sites = await getTrustedSites();
  list.replaceChildren();
  if (sites.length === 0) list.append(el('li', 'empty', t('trustedEmpty')));
  for (const site of sites) {
    const li = el('li');
    const remove = el('button', 'linkish qr-btn', '×') as HTMLButtonElement;
    remove.type = 'button';
    remove.setAttribute('aria-label', t('trustedRemove', site));
    remove.title = t('trustedRemove', site);
    remove.addEventListener('click', async () => {
      await removeTrustedSite(site);
      status.textContent = '';
      void renderSites();
    });
    li.append(el('span', 'site', site), remove);
    list.append(li);
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const added = await addTrustedSite(input.value);
  status.textContent = added ? t('trustedSaved', added) : t('trustedInvalid');
  if (added) input.value = '';
  void renderSites();
});

const blocklistEnabled = $<HTMLInputElement>('blocklist-enabled');
const blocklistStatus = $('blocklist-status');

async function renderBlocklist() {
  blocklistEnabled.checked = await isBlocklistEnabled();
  const info = blocklistEnabled.checked ? await blocklistInfo() : null;
  blocklistStatus.textContent = !blocklistEnabled.checked
    ? ''
    : info
      ? t('blocklistStatus', new Date(info.generated).toLocaleString(t('lang')), info.entries.toLocaleString(t('lang')))
      : t('blocklistNone');
}

blocklistEnabled.addEventListener('change', async () => {
  await setBlocklistEnabled(blocklistEnabled.checked);
  void renderBlocklist();
  // Al activarla, se descarga ya (en el background) en lugar de esperar a la próxima alarma.
  if (blocklistEnabled.checked) {
    await browser.runtime.sendMessage({ type: 'blocklist-update' } satisfies FromPopup);
    void renderBlocklist();
  }
});

const cleanLinks = $<HTMLInputElement>('clean-links');
cleanLinks.addEventListener('change', () => void setCleanLinks(cleanLinks.checked));

void renderSites();
void renderBlocklist();
void getCleanLinks().then((clean) => (cleanLinks.checked = clean));
