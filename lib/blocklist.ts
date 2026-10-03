// Lista pública de phishing comparada en local (Fase 4 · 4.0). Lógica común a la extensión y al script que la genera
// (scripts/build-blocklist.ts, en una GitHub Action): por eso no importa nada con el alias «@/».
//
// Formato publicado (GitHub Pages):
// - meta.json: fecha, recuentos, huella SHA-256 de blocklist.bin y fuentes con su licencia;
// - meta.sig: firma Ed25519 (base64) de los bytes exactos de meta.json. La clave pública va dentro de la extensión:
//   ni una cuenta de GitHub comprometida podría colar una lista falsa;
// - blocklist.bin: huellas SHA-256 recortadas a HASH_BYTES, ordenadas: primero las de dominios, luego las de URLs.
// Un dominio entero solo se marca si no es una web popular ni de una marca; si no, solo la URL exacta.

import { parse as parseDomain } from 'tldts';

export const HASH_BYTES = 6;

export interface BlocklistMeta {
  version: 1;
  /** Fecha de generación (ISO). */
  generated: string;
  /** SHA-256 de blocklist.bin, en hexadecimal. */
  sha256: string;
  hashBytes: number;
  domains: number;
  urls: number;
  sources: { name: string; url: string; license: string }[];
}

/** Dominio registrable (con las plataformas compartidas como sitios propios: paypal.github.io), sin «www.». */
export function domainKey(host: string): string | null {
  const h = host.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
  const domain = parseDomain(h, { allowPrivateDomains: true }).domain;
  return domain ?? null;
}

/**
 * Forma canónica de una URL para compararla con la lista: sin esquema, sin «www.», sin puerto por defecto ni fragmento,
 * todo en minúsculas (así viene Phishing.Database) y sin la barra final de la portada. Null si no es http(s).
 */
export function urlKey(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
  if (!host) return null;
  const port = url.port ? `:${url.port}` : '';
  const rest = url.pathname === '/' && !url.search ? '' : `${url.pathname}${url.search}`;
  return `${host}${port}${rest}`.toLowerCase();
}

export async function hashKey(key: string, bytes = HASH_BYTES): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return new Uint8Array(digest, 0, bytes);
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data as BufferSource));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

function compare(a: Uint8Array, aOff: number, b: Uint8Array, n: number): number {
  for (let i = 0; i < n; i++) {
    const d = a[aOff + i]! - b[i]!;
    if (d !== 0) return d;
  }
  return 0;
}

/** Ordena y quita duplicados de huellas de `n` bytes, y las junta en un solo bloque. */
export function packHashes(hashes: Uint8Array[], n = HASH_BYTES): Uint8Array {
  const sorted = [...hashes].sort((a, b) => compare(a, 0, b, n));
  const out: Uint8Array[] = [];
  for (const h of sorted) if (out.length === 0 || compare(out.at(-1)!, 0, h, n) !== 0) out.push(h);
  const block = new Uint8Array(out.length * n);
  out.forEach((h, i) => block.set(h.subarray(0, n), i * n));
  return block;
}

/** Búsqueda binaria de una huella en un bloque ordenado de huellas de `n` bytes. */
export function hasHash(block: Uint8Array, hash: Uint8Array, n = HASH_BYTES): boolean {
  let lo = 0;
  let hi = block.length / n - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const c = compare(block, mid * n, hash, n);
    if (c === 0) return true;
    if (c < 0) lo = mid + 1;
    else hi = mid - 1;
  }
  return false;
}

export class Blocklist {
  readonly domains: Uint8Array;
  readonly urls: Uint8Array;
  readonly meta: BlocklistMeta;

  // Sin «parameter properties»: el script de la Action ejecuta este fichero con Node, que solo quita tipos.
  constructor(bin: Uint8Array, meta: BlocklistMeta) {
    this.meta = meta;
    const n = meta.hashBytes;
    if (bin.length !== (meta.domains + meta.urls) * n) throw new Error('blocklist.bin no cuadra con meta.json');
    this.domains = bin.subarray(0, meta.domains * n);
    this.urls = bin.subarray(meta.domains * n);
  }

  /** ¿La URL (o su dominio entero) está en la lista? */
  async has(href: string): Promise<boolean> {
    const key = urlKey(href);
    if (!key) return false;
    const n = this.meta.hashBytes;
    if (hasHash(this.urls, await hashKey(key, n), n)) return true;
    const domain = domainKey(new URL(href).hostname);
    return !!domain && hasHash(this.domains, await hashKey(domain, n), n);
  }
}

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0));
}

/**
 * Comprueba la firma de meta.json y que blocklist.bin es el que dice. Devuelve la lista o lanza.
 * `publicKey`: clave pública Ed25519 en bruto (32 bytes), en base64.
 */
export async function verifyBlocklist(metaBytes: Uint8Array, signature: string, bin: Uint8Array, publicKey: string): Promise<Blocklist> {
  const key = await crypto.subtle.importKey('raw', base64ToBytes(publicKey) as BufferSource, { name: 'Ed25519' }, false, ['verify']);
  const ok = await crypto.subtle.verify({ name: 'Ed25519' }, key, base64ToBytes(signature) as BufferSource, metaBytes as BufferSource);
  if (!ok) throw new Error('firma de la lista no válida');
  const meta = JSON.parse(new TextDecoder().decode(metaBytes)) as BlocklistMeta;
  if (meta.version !== 1 || meta.hashBytes < 4 || meta.hashBytes > 32) throw new Error('versión de la lista no admitida');
  if ((await sha256Hex(bin)) !== meta.sha256) throw new Error('blocklist.bin no coincide con su huella');
  return new Blocklist(bin, meta);
}
