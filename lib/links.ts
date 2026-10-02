// Enlaces escondidos dentro de un contenido que no es una URL: «Paga aquí: https://…» en un texto, un SMS o un email.
// El smishing llega así: el código entero no es un enlace, pero lleva uno dentro.

const LINK = /\b(?:https?:\/\/|www\.)[^\s<>"'`{}|\\^]+/gi;
const MAX_LINKS = 10;

/** URLs que aparecen en el texto, sin repetir y en orden; las que empiezan por «www.» se completan con https://. */
export function extractLinks(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(LINK)) {
    const link = trimTrailing(match[0]);
    if (!/^https?:\/\//i.test(link) && !/^www\.[^/]+\.[a-z]{2,}/i.test(link)) continue;
    const url = /^www\./i.test(link) ? `https://${link}` : link;
    if (!found.includes(url)) found.push(url);
    if (found.length === MAX_LINKS) break;
  }
  return found;
}

/** Quita la puntuación final que cierra la frase («…/pago.»), y los paréntesis de cierre que no abrió el enlace. */
function trimTrailing(link: string): string {
  let s = link;
  for (;;) {
    const last = s.at(-1);
    if (!last) return s;
    if ('.,;:!?»”’'.includes(last)) s = s.slice(0, -1);
    else if (last === ')' && count(s, '(') < count(s, ')')) s = s.slice(0, -1);
    else if (last === ']' && count(s, '[') < count(s, ']')) s = s.slice(0, -1);
    else return s;
  }
}

function count(s: string, ch: string) {
  return s.split(ch).length - 1;
}
