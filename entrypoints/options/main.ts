import { addTrustedSite, getTrustedSites, removeTrustedSite } from '@/lib/context';
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

void renderSites();
