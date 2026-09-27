// Caracteres invisibles o que cambian la dirección del texto (bidi): permiten que un código se vea distinto
// de lo que realmente contiene. Ejemplo: "ES91‮2100…" se muestra con los dígitos en otro orden.
// Se señalan con un aviso y se hacen visibles al mostrarlos.

const HIDDEN = /[؜​‌‎‏‪-‮⁠⁦-⁩﻿]/g;

/** Códigos (U+XXXX) de los caracteres ocultos que contiene el texto, sin repetir. */
export function hiddenChars(text: string): string[] {
  return [...new Set(text.match(HIDDEN) ?? [])].map(codePoint);
}

/** El texto con cada carácter oculto sustituido por una marca visible «⟨U+202E⟩». */
export function revealHidden(text: string): string {
  return text.replace(HIDDEN, (c) => `⟨${codePoint(c)}⟩`);
}

function codePoint(c: string) {
  return `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;
}
