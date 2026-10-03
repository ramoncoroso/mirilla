// pruebas de lib/blocklist-store.ts: descarga, verificación y guardado en IndexedDB de la lista pública (ver
// lib/blocklist.ts y tests/blocklist.test.ts para el formato). El store usa la clave pública real (no la de
// pruebas E2E), así que se sustituye por la de pruebas (tests/e2e/blocklist-key.json) al verificar la firma.
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { HASH_BYTES, hashKey, packHashes, sha256Hex, type BlocklistMeta } from '@/lib/blocklist';
import type { ContextData } from '@/lib/context';
import type { Code } from '@/lib/decode';

const KEY_PATH = fileURLToPath(new URL('./e2e/blocklist-key.json', import.meta.url));
const TEST_KEY = JSON.parse(readFileSync(KEY_PATH, 'utf-8')) as { publicKey: string; privateKey: string };
const BASE = 'https://ramoncoroso.github.io/mirilla/blocklist/';

vi.mock('@/lib/blocklist', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/blocklist')>();
  const { readFileSync: read } = await import('node:fs');
  const { fileURLToPath: toPath } = await import('node:url');
  const keyPath = toPath(new URL('./e2e/blocklist-key.json', import.meta.url));
  const testPub = (JSON.parse(read(keyPath, 'utf-8')) as { publicKey: string }).publicKey;
  return {
    ...original,
    verifyBlocklist: (meta: Uint8Array, sig: string, bin: Uint8Array, _key: string) => original.verifyBlocklist(meta, sig, bin, testPub),
  };
});

interface SignedList {
  meta: BlocklistMeta;
  metaBytes: Uint8Array;
  sig: string;
  bin: Uint8Array;
}

/** Construye una lista firmada con la clave privada de pruebas, igual que scripts/build-blocklist.ts. */
async function signedList(domains: string[], urls: string[]): Promise<SignedList> {
  const privateKey = await crypto.subtle.importKey('pkcs8', Buffer.from(TEST_KEY.privateKey, 'base64'), { name: 'Ed25519' }, false, ['sign']);
  const domainHashes = await Promise.all(domains.map((d) => hashKey(d)));
  const urlHashes = await Promise.all(urls.map((u) => hashKey(u)));
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
    sources: [{ name: 'Prueba', url: 'https://example.test', license: 'MIT' }],
  };
  const metaBytes = new TextEncoder().encode(JSON.stringify(meta));
  const sigBytes = await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, metaBytes as BufferSource);
  return { meta, metaBytes, sig: Buffer.from(sigBytes).toString('base64'), bin };
}

/** Cambia un carácter de en medio de una firma en base64: misma longitud, pero ya no verifica. */
function corruptSignature(sig: string): string {
  const i = Math.floor(sig.length / 2);
  return `${sig.slice(0, i)}${sig[i] === 'A' ? 'B' : 'A'}${sig.slice(i + 1)}`;
}

/** Mock de fetch que sirve meta.json / meta.sig / blocklist.bin de `list`, anotando las URLs pedidas en `calls`. */
function fetchMock(list: SignedList, calls: string[] = []) {
  return vi.fn(async (url: string) => {
    calls.push(url);
    if (url === `${BASE}meta.json`) return new Response(list.metaBytes as BufferSource);
    if (url === `${BASE}meta.sig`) return new Response(list.sig);
    if (url === `${BASE}blocklist.bin`) return new Response(list.bin as BufferSource);
    throw new Error(`url inesperada: ${url}`);
  });
}

async function freshStore() {
  return import('@/lib/blocklist-store');
}

const code = (text: string): Code => ({ text, format: 'QR', gs1: false });

describe('blocklist-store', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('descarga y guardado', () => {
    it('descarga meta.json, meta.sig y blocklist.bin, y los guarda', async () => {
      const list = await signedList(['evil.example'], ['popular.example/phish']);
      const calls: string[] = [];
      vi.stubGlobal('fetch', fetchMock(list, calls));
      const store = await freshStore();

      await store.updateBlocklist();

      expect(calls.sort()).toEqual([`${BASE}blocklist.bin`, `${BASE}meta.json`, `${BASE}meta.sig`].sort());
      expect(await store.loadBlocklist()).not.toBeNull();
    });

    it('listedLinks devuelve solo los enlaces de lo que se pasa que están en la lista, y la fecha', async () => {
      const list = await signedList(['evil.example'], ['popular.example/phish']);
      vi.stubGlobal('fetch', fetchMock(list));
      const store = await freshStore();
      await store.updateBlocklist();

      const found = await store.listedLinks([
        'https://sub.evil.example/x', // dominio entero marcado
        'https://popular.example/phish', // URL exacta marcada
        'https://popular.example/otra-ruta', // mismo dominio, pero no esta URL
        'https://limpio.test/',
      ]);

      expect(found?.listed.sort()).toEqual(['https://popular.example/phish', 'https://sub.evil.example/x']);
      expect(found?.generated).toBe(list.meta.generated);
    });

    it('una segunda actualización con el mismo sha256 no vuelve a descargar blocklist.bin', async () => {
      const list = await signedList(['evil.example'], []);
      const calls: string[] = [];
      vi.stubGlobal('fetch', fetchMock(list, calls));
      const store = await freshStore();

      await store.updateBlocklist();
      await store.updateBlocklist();

      expect(calls.filter((u) => u === `${BASE}blocklist.bin`)).toHaveLength(1);
      expect(calls.filter((u) => u === `${BASE}meta.json`)).toHaveLength(2);
    });
  });

  describe('firma inválida o red caída', () => {
    it('con una lista buena previa, una firma inválida después se descarta y se conserva la buena', async () => {
      const good = await signedList(['evil.example'], []);
      vi.stubGlobal('fetch', fetchMock(good));
      const store = await freshStore();
      await store.updateBlocklist();
      expect((await store.blocklistInfo())?.generated).toBe(good.meta.generated);

      const bad = await signedList(['otro.example'], []); // contenido distinto: fuerza a descargar blocklist.bin de nuevo
      vi.stubGlobal('fetch', fetchMock({ ...bad, sig: corruptSignature(bad.sig) }));

      await expect(store.updateBlocklist()).resolves.toBeUndefined();
      expect((await store.blocklistInfo())?.generated).toBe(good.meta.generated);

      // No solo en memoria: lo guardado en IndexedDB tampoco se tocó.
      vi.resetModules();
      const reloaded = await freshStore();
      expect((await reloaded.blocklistInfo())?.generated).toBe(good.meta.generated);
    });

    it('sin lista previa, una firma inválida no guarda nada: loadBlocklist da null', async () => {
      const bad = await signedList(['evil.example'], []);
      vi.stubGlobal('fetch', fetchMock({ ...bad, sig: corruptSignature(bad.sig) }));
      const store = await freshStore();

      await expect(store.updateBlocklist()).resolves.toBeUndefined();
      expect(await store.loadBlocklist()).toBeNull();
    });

    it('un error de red no lanza, y loadBlocklist sigue dando null', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new Error('red caída');
        }),
      );
      const store = await freshStore();

      await expect(store.updateBlocklist()).resolves.toBeUndefined();
      expect(await store.loadBlocklist()).toBeNull();
    });
  });

  describe('activar o desactivar', () => {
    it('desactivada: updateBlocklist no descarga nada y loadBlocklist da null', async () => {
      const fetchFn = vi.fn();
      vi.stubGlobal('fetch', fetchFn);
      const store = await freshStore();
      await store.setBlocklistEnabled(false);

      await store.updateBlocklist();

      expect(fetchFn).not.toHaveBeenCalled();
      expect(await store.loadBlocklist()).toBeNull();
    });

    it('desactivar borra lo guardado; al reactivar sigue sin lista hasta la próxima actualización', async () => {
      const list = await signedList(['evil.example'], []);
      vi.stubGlobal('fetch', fetchMock(list));
      const store = await freshStore();
      await store.updateBlocklist();
      expect(await store.loadBlocklist()).not.toBeNull();

      await store.setBlocklistEnabled(false);
      expect(await store.loadBlocklist()).toBeNull();

      await store.setBlocklistEnabled(true);
      expect(await store.loadBlocklist()).toBeNull();
    });
  });

  describe('aviso de la primera ejecución', () => {
    it('empieza sin verse, y markBlocklistNoticeSeen lo marca', async () => {
      const store = await freshStore();
      expect(await store.blocklistNoticeSeen()).toBe(false);
      await store.markBlocklistNoticeSeen();
      expect(await store.blocklistNoticeSeen()).toBe(true);
    });
  });

  describe('integración con el contexto (withListed)', () => {
    it('añade «listed» para un código cuya URL está en la lista', async () => {
      const list = await signedList(['evil.example'], []);
      vi.stubGlobal('fetch', fetchMock(list));
      const store = await freshStore();
      await store.updateBlocklist();

      const { withListed } = await import('@/lib/context');
      const data: ContextData = { trusted: [], known: null, cleanLinks: true };
      const codes: Code[] = [code('https://sub.evil.example/x'), code('https://limpio.test/')];

      const result = await withListed(data, codes);

      expect(result.listed).toEqual(['https://sub.evil.example/x']);
      expect(result.listGenerated).toBe(list.meta.generated);
    });
  });
});
