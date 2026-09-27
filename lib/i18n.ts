import { browser } from 'wxt/browser';
import type { MessageKey } from '@/locales/messages';

/** Texto traducido al idioma del navegador (inglés por defecto). */
export function t(key: MessageKey, ...subs: (string | number)[]): string {
  // getMessage está tipado con las claves que WXT conoce, que no incluyen las generadas en el hook.
  const getMessage = browser.i18n.getMessage as (key: string, subs?: string[]) => string;
  return getMessage(key, subs.map(String)) || key;
}
