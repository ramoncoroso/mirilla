#!/usr/bin/env node
// Genera lib/data/confusables.ts (tabla reducida de "skeleton" UTS #39) y lib/data/LICENSE-unicode.txt
// a partir de https://www.unicode.org/Public/security/latest/confusables.txt
//
// Ejecutar con: node scripts/gen-confusables.mjs
//
// Script Node ESM sin dependencias externas. Usa node:url (domainToUnicode) solo para decidir, en
// tiempo de generación, si un carácter sobrevive al procesado IDNA de un hostname; esto NO es una
// dependencia de la extensión: lib/data/confusables.ts (el archivo generado) no usa APIs de Node.

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { domainToUnicode } from 'node:url';

const CONFUSABLES_URL = 'https://www.unicode.org/Public/security/latest/confusables.txt';
const LICENSE_URL = 'https://www.unicode.org/license.txt';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'lib', 'data');

// Carácter de letra/número/marca que puede aparecer en una etiqueta de dominio tras IDNA.
const LABEL_CHAR = /[\p{L}\p{N}\p{M}]/u;
// El destino, tras minúsculas, solo puede contener lo que es válido en un host ASCII.
const ASCII_TARGET = /^[a-z0-9-]+$/;

/** Separadores de la codificación compacta: no pueden aparecer ni en orígenes ni en destinos. */
const ENTRY_SEP = '|';
const FIELD_SEP = ':';

function parseHeader(text) {
  const versionMatch = text.match(/^#\s*Version:\s*(\S+)/m);
  const dateMatch = text.match(/^#\s*Date:\s*([^\n]+)/m);
  return {
    version: versionMatch ? versionMatch[1].trim() : 'desconocida',
    date: dateMatch ? dateMatch[1].trim() : 'fecha desconocida',
  };
}

/** Parsea las líneas de datos de confusables.txt: "SRC ; TGT TGT... ; TIPO # comentario". */
function parseLines(text) {
  const entries = [];
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([0-9A-Fa-f]+)\s*;\s*([0-9A-Fa-f](?:[0-9A-Fa-f ])*)\s*;\s*\w+\s*#/);
    if (!match) continue;
    const srcHex = match[1].trim();
    const tgtHex = match[2].trim().split(/\s+/);
    entries.push({ srcHex, tgtHex });
  }
  return entries;
}

function codePointsToString(hexList) {
  return hexList.map((h) => String.fromCodePoint(parseInt(h, 16))).join('');
}

/** ¿Sobrevive `ch` al procesado IDNA de un hostname, literalmente, sin ser transformado a otra cosa? */
function survivesIdna(ch) {
  let url;
  try {
    url = new URL(`https://x${ch}x.com`);
  } catch {
    return false;
  }
  const decoded = domainToUnicode(url.hostname);
  return decoded.includes(ch);
}

function buildTable(entries) {
  const seen = new Set();
  const pairs = [];

  for (const { srcHex, tgtHex } of entries) {
    // Solo orígenes de un único code point.
    if (srcHex.includes(' ')) continue;

    const codePoint = parseInt(srcHex, 16);
    if (codePoint <= 0x7f) continue; // el origen ya es ASCII: no aporta nada a un skeleton.

    const ch = String.fromCodePoint(codePoint);
    if (seen.has(ch)) continue; // nos quedamos con la primera correspondencia del archivo.
    if (!LABEL_CHAR.test(ch)) continue;
    if (!survivesIdna(ch)) continue;

    const target = codePointsToString(tgtHex).toLowerCase();
    if (!ASCII_TARGET.test(target)) continue;

    seen.add(ch);
    pairs.push([ch, target]);
  }

  return pairs;
}

function encodeData(pairs) {
  // "<origen>:<destino>|<origen>:<destino>|..." — seguro porque el destino es [a-z0-9-]+
  // y el origen es una letra/número/marca Unicode (nunca '|' ni ':').
  return pairs.map(([src, tgt]) => `${src}${FIELD_SEP}${tgt}`).join(ENTRY_SEP);
}

/** Escapa caracteres no imprimibles o combinantes para que el literal de cadena sea legible y seguro. */
function escapeForSource(s) {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    const isCombining =
      (cp >= 0x0300 && cp <= 0x036f) || // Combining Diacritical Marks
      (cp >= 0x1ab0 && cp <= 0x1aff) ||
      (cp >= 0x1dc0 && cp <= 0x1dff) ||
      (cp >= 0x20d0 && cp <= 0x20ff) ||
      (cp >= 0xfe20 && cp <= 0xfe2f);
    const isPrintableAscii = cp >= 0x21 && cp <= 0x7e;
    if (isPrintableAscii && !isCombining) {
      out += ch;
    } else {
      out += `\\u{${cp.toString(16)}}`;
    }
  }
  return out;
}

async function main() {
  console.log(`Descargando ${CONFUSABLES_URL} ...`);
  const confusablesRes = await fetch(CONFUSABLES_URL);
  if (!confusablesRes.ok) throw new Error(`fallo al descargar confusables.txt: ${confusablesRes.status}`);
  const confusablesText = await confusablesRes.text();

  console.log(`Descargando ${LICENSE_URL} ...`);
  const licenseRes = await fetch(LICENSE_URL);
  if (!licenseRes.ok) throw new Error(`fallo al descargar license.txt: ${licenseRes.status}`);
  const licenseText = await licenseRes.text();

  const { version, date } = parseHeader(confusablesText);
  const entries = parseLines(confusablesText);
  const pairs = buildTable(entries);
  const data = encodeData(pairs);
  const escaped = escapeForSource(data);

  const header = `// Generado por scripts/gen-confusables.mjs a partir de confusables.txt (Unicode ${version}, ${date}). No editar a mano.
// Copyright © 1991-2026 Unicode, Inc. Unicode License v3: https://www.unicode.org/license.txt
// Tabla reducida: solo caracteres que pueden aparecer en un dominio y que se confunden con letras o dígitos ASCII.
`;

  const body = `
/** Pares «carácter origen» + «destino ASCII», separados por ${ENTRY_SEP} / ${FIELD_SEP}. */
const DATA =
  '${escaped}';

let table: Map<string, string> | undefined;

function getTable(): Map<string, string> {
  if (table) return table;
  table = new Map();
  if (DATA.length > 0) {
    for (const entry of DATA.split('${ENTRY_SEP}')) {
      const sep = entry.indexOf('${FIELD_SEP}');
      const src = entry.slice(0, sep);
      const tgt = entry.slice(sep + 1);
      table.set(src, tgt);
    }
  }
  return table;
}

/**
 * «Esqueleto» de una etiqueta (UTS #39, simplificado): cada carácter que se confunde con ASCII se sustituye por su
 * equivalente; se aplica NFD antes y NFC después, como pide el estándar, y se pasa a minúsculas.
 *
 * Al ser una tabla reducida, los caracteres que no estén en ella pasan sin cambios. Las marcas combinantes que
 * aparecen tras el NFD (p. ej. «é» → 'e' + U+0301) NO se eliminan: solo nos interesa la sustitución de
 * confundibles, no un plegado completo a ASCII.
 */
export function skeleton(text: string): string {
  const map = getTable();
  const decomposed = text.normalize('NFD');
  let out = '';
  for (const ch of decomposed) {
    out += map.get(ch) ?? ch;
  }
  return out.normalize('NFC').toLowerCase();
}
`;

  const outFile = header + body;
  await writeFile(join(OUT_DIR, 'confusables.ts'), outFile, 'utf8');
  await writeFile(join(OUT_DIR, 'LICENSE-unicode.txt'), licenseText, 'utf8');

  console.log(`Unicode ${version} (${date})`);
  console.log(`Entradas: ${pairs.length}`);
  console.log(`Tamaño de confusables.ts: ${Buffer.byteLength(outFile, 'utf8')} bytes`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
