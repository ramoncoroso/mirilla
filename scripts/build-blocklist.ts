// Genera la lista pública de phishing que descarga Mirilla (la ejecuta .github/workflows/blocklist.yml cada 6 h).
// Uso: BLOCKLIST_SIGNING_KEY=<PKCS8 Ed25519 en base64> node scripts/build-blocklist.ts [carpeta de salida]
//
// Fuente: Phishing.Database (MIT). URLhaus no: sus condiciones actuales no permiten redistribuirlo.
// Filtro contra falsos positivos: las listas incluyen URLs en servicios legítimos (docs.google.com, sites de Wix...).
// Si el dominio es una web popular (Tranco top 100.000) o de una marca conocida, solo se marca la URL exacta, nunca
// el dominio entero. Tranco solo se usa aquí para filtrar: no se publica.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BRANDS } from '../lib/data/brands.ts';
import { domainKey, HASH_BYTES, packHashes, sha256Hex, urlKey, type BlocklistMeta } from '../lib/blocklist.ts';

/** Lo mismo que hashKey (SHA-256 recortado), pero síncrono: con cientos de miles de entradas es mucho más rápido. */
const hashKey = (key: string) => new Uint8Array(createHash('sha256').update(key).digest().subarray(0, HASH_BYTES));

const OUT = process.argv[2] ?? 'dist-blocklist';
const POPULAR = 100_000;
const SOURCE = 'https://raw.githubusercontent.com/Phishing-Database/Phishing.Database/master';

async function text(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.text();
}

const lines = (s: string) =>
  s
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

async function popularDomains(): Promise<Set<string>> {
  // Fuera de la carpeta publicada: Tranco no se puede redistribuir.
  const dir = mkdtempSync(path.join(tmpdir(), 'tranco-'));
  const zip = path.join(dir, 'top-1m.csv.zip');
  writeFileSync(zip, Buffer.from(await (await fetch('https://tranco-list.eu/top-1m.csv.zip')).arrayBuffer()));
  const csv = execFileSync('unzip', ['-p', zip], { maxBuffer: 64 * 1024 * 1024 }).toString();
  rmSync(dir, { recursive: true });
  const set = new Set<string>();
  for (const line of csv.split('\n').slice(0, POPULAR)) {
    const d = line.split(',')[1]?.trim();
    const key = d && domainKey(d);
    if (key) set.add(key);
  }
  return set;
}

async function signer(): Promise<CryptoKey> {
  const b64 = process.env.BLOCKLIST_SIGNING_KEY;
  if (!b64) throw new Error('Falta BLOCKLIST_SIGNING_KEY');
  return crypto.subtle.importKey('pkcs8', Buffer.from(b64, 'base64'), { name: 'Ed25519' }, false, ['sign']);
}

mkdirSync(OUT, { recursive: true });
const key = await signer();
const popular = await popularDomains();
for (const brand of BRANDS) for (const d of brand.domains) popular.add(domainKey(d) ?? d);

const [links, domains] = await Promise.all([text(`${SOURCE}/phishing-links-ACTIVE.txt`), text(`${SOURCE}/phishing-domains-ACTIVE.txt`)]);

const domainHashes: Uint8Array[] = [];
const urlHashes: Uint8Array[] = [];
let skippedPopular = 0;
let skippedHome = 0;

for (const host of lines(domains)) {
  const d = domainKey(host);
  if (!d) continue;
  if (popular.has(d)) skippedPopular++;
  else domainHashes.push(hashKey(d));
}
for (const link of lines(links)) {
  const u = urlKey(link);
  if (!u) continue;
  const d = domainKey(new URL(link).hostname);
  // Dominio no popular: se marca entero; popular (o una IP, sin dominio): solo esta URL, y nunca su portada (la fuente
  // trae algunas, como amazon.com: falsos positivos).
  if (d && !popular.has(d)) domainHashes.push(hashKey(d));
  else if (!d || u.includes('/')) urlHashes.push(hashKey(u));
  else skippedHome++;
}

const domainBlock = packHashes(domainHashes);
const urlBlock = packHashes(urlHashes);
const bin = new Uint8Array(domainBlock.length + urlBlock.length);
bin.set(domainBlock);
bin.set(urlBlock, domainBlock.length);

const meta: BlocklistMeta = {
  version: 1,
  generated: new Date().toISOString(),
  sha256: await sha256Hex(bin),
  hashBytes: HASH_BYTES,
  domains: domainBlock.length / HASH_BYTES,
  urls: urlBlock.length / HASH_BYTES,
  sources: [{ name: 'Phishing.Database', url: 'https://github.com/Phishing-Database/Phishing.Database', license: 'MIT' }],
};
const metaBytes = new TextEncoder().encode(JSON.stringify(meta));
const signature = Buffer.from(await crypto.subtle.sign({ name: 'Ed25519' }, key, metaBytes)).toString('base64');

writeFileSync(path.join(OUT, 'blocklist.bin'), bin);
writeFileSync(path.join(OUT, 'meta.json'), metaBytes);
writeFileSync(path.join(OUT, 'meta.sig'), signature);
writeFileSync(path.join(OUT, 'LICENSE-phishing-database.txt'), readFileSync('tests/measure/samples/LICENSE-phishing-database.txt'));
console.log(
  `lista: ${meta.domains} dominios + ${meta.urls} URLs exactas (${(bin.length / 1e6).toFixed(1)} MB); ${skippedPopular} dominios populares solo por URL; ${skippedHome} portadas populares descartadas`,
);
