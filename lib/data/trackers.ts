// Parámetros de URL que solo sirven para rastrear al visitante (campaña, clic de un anuncio,
// id de sesión de un email...) y que se pueden quitar sin cambiar la página a la que lleva la URL.
// Lista elaborada a partir de fuentes públicas que documentan qué parámetros son puro rastreo:
// - Firefox, "Query Parameter Stripping" (https://support.mozilla.org/kb/query-parameter-stripping).
// - Brave Browser, lista de "tracker query parameters" (https://github.com/brave/brave-core,
//   componente de bloqueo de parámetros de rastreo).
// - ClearURLs, reglas globales (https://github.com/ClearURLs/Rules) — de ahí solo se toman los
//   NOMBRES de los parámetros (un hecho, no una obra con derechos), no las reglas ni el código.
// Solo entran parámetros que identifican una campaña/clic/origen de marketing y que ningún sitio
// necesita para servir el contenido. Se excluyen a propósito, por ambiguos, parámetros que
// *a veces* son puro rastreo pero en otros sitios cambian de verdad lo que se muestra o cómo
// funciona la página: "ref"/"source" (se usan para lógica real en muchas webs), "si" (en
// YouTube/Spotify es solo el origen del compartir, pero el nombre es tan corto y genérico que
// podría ser otra cosa en otro sitio), "s_cid" (Adobe Analytics, pero también usado como id de
// contenido real en algunos sitios), "icid"/"cmpid" (campaña interna, pero algunos medios los
// usan para decidir qué variante de contenido mostrar).
export const TRACKING_PARAMS: ReadonlySet<string> = new Set([
  // Google Analytics / "Urchin Tracking Module": utm_source, utm_medium... se cubren con el
  // prefijo utm_ (ver TRACKING_PREFIXES), aquí solo van nombres sueltos sin ese prefijo.
  'fbclid', // Facebook / Meta Ads.
  'gclid', // Google Ads.
  'gclsrc', // Google Ads, acompaña a gclid.
  'dclid', // Google DoubleClick.
  'gbraid', // Google Ads (clics en iOS, post "App Tracking Transparency").
  'wbraid', // Google Ads (clics web, post "App Tracking Transparency").
  'msclkid', // Microsoft/Bing Ads.
  'mc_eid', // Mailchimp, id de suscriptor del email.
  'mc_cid', // Mailchimp, id de campaña de email.
  'mkt_tok', // Marketo (automatización de marketing por email).
  'igshid', // Instagram, id de la acción de compartir.
  'igsh', // Instagram, variante actual de igshid.
  '_hsenc', // HubSpot.
  '_hsmi', // HubSpot.
  'yclid', // Yandex Direct (Yandex Ads).
  'twclid', // X/Twitter Ads.
  'ttclid', // TikTok Ads.
  'li_fat_id', // LinkedIn Ads ("first party ad tracking id").
  'oly_enc_id', // Omeda/Olytics (boletines de medios).
  'oly_anon_id', // Omeda/Olytics.
  'vero_id', // Vero (automatización de marketing).
  '__s', // Drip/Intercom, id de contacto en emails.
  'rb_clickid', // Rakuten Advertising, id de clic de afiliado.
  's_kwcid', // Adobe Advertising Cloud, id de palabra clave de un anuncio de búsqueda.
  'epik', // Pinterest Ads.
  '_ga', // Google Analytics, enlazado entre dominios.
  '_openstat', // Openstat (analítica rusa muy usada para campañas de email/SMS).
]);

/** Prefijos de parámetros de rastreo con muchas variantes (utm_source, utm_medium, utm_campaign...). */
export const TRACKING_PREFIXES: readonly string[] = ['utm_'];

/**
 * Quita de una URL los parámetros de rastreo conocidos.
 * Nunca toca el resto: ni el orden de los parámetros que quedan, ni su codificación
 * (por eso no se reconstruye con URLSearchParams, que recodifica y reordena), ni el fragmento (#).
 * Si la URL no es válida, se devuelve tal cual.
 */
export function stripTrackers(href: string): { href: string; removed: string[] } {
  try {
    new URL(href); // solo para validar; el recorte se hace sobre el texto original, no sobre la URL reconstruida.
  } catch {
    return { href, removed: [] };
  }

  const hashIndex = href.indexOf('#');
  const searchEnd = hashIndex === -1 ? href.length : hashIndex;
  const queryIndex = href.indexOf('?');
  if (queryIndex === -1 || queryIndex > searchEnd) {
    return { href, removed: [] };
  }

  const rawQuery = href.slice(queryIndex + 1, searchEnd);
  const removed: string[] = [];
  const kept = rawQuery.split('&').filter((pair) => {
    const eq = pair.indexOf('=');
    const name = (eq === -1 ? pair : pair.slice(0, eq)).toLowerCase();
    const isTracker = TRACKING_PARAMS.has(name) || TRACKING_PREFIXES.some((prefix) => name.startsWith(prefix));
    if (isTracker) removed.push(eq === -1 ? pair : pair.slice(0, eq));
    return !isTracker;
  });

  if (removed.length === 0) {
    return { href, removed: [] };
  }

  const newSearch = kept.length > 0 ? `?${kept.join('&')}` : '';
  return { href: href.slice(0, queryIndex) + newSearch + href.slice(searchEnd), removed };
}
