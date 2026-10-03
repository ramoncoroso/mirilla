// pruebas de lib/blocklist.ts: forma canónica de dominios y URLs, empaquetado de huellas y comprobación de la firma.
import { describe, expect, it } from 'vitest';
import { HASH_BYTES, domainKey, hasHash, hashKey, packHashes, sha256Hex, urlKey, verifyBlocklist, type BlocklistMeta } from '@/lib/blocklist';

describe('urlKey', () => {
  it('quita el esquema', () => {
    expect(urlKey('https://example.com/path')).toBe('example.com/path');
  });

  it('quita el «www.»', () => {
    expect(urlKey('https://www.example.com/path')).toBe('example.com/path');
  });

  it('quita el puerto cuando es el de por defecto', () => {
    expect(urlKey('https://example.com:443/path')).toBe('example.com/path');
    expect(urlKey('http://example.com:80/path')).toBe('example.com/path');
  });

  it('mantiene un puerto que no es el de por defecto', () => {
    expect(urlKey('https://example.com:8443/path')).toBe('example.com:8443/path');
  });

  it('quita el fragmento', () => {
    expect(urlKey('https://example.com/path#section')).toBe('example.com/path');
  });

  it('pasa todo a minúsculas', () => {
    expect(urlKey('HTTPS://EXAMPLE.COM/PATH?X=1')).toBe('example.com/path?x=1');
  });

  it('la portada («/», sin query) se queda solo con el host', () => {
    expect(urlKey('https://example.com/')).toBe('example.com');
  });

  it('la portada con query sí mantiene la barra', () => {
    expect(urlKey('https://example.com/?x=1')).toBe('example.com/?x=1');
  });

  it('mantiene la ruta y la query', () => {
    expect(urlKey('https://example.com/a/b?x=1&y=2')).toBe('example.com/a/b?x=1&y=2');
  });

  it('null si el esquema no es http ni https', () => {
    expect(urlKey('ftp://example.com/file')).toBeNull();
    expect(urlKey('javascript:alert(1)')).toBeNull();
  });

  it('null si no es una URL válida', () => {
    expect(urlKey('esto no es una url')).toBeNull();
  });
});

describe('domainKey', () => {
  it('saca el dominio registrable, sin «www.» y en minúsculas', () => {
    expect(domainKey('www.Evil.example.com')).toBe('example.com');
  });

  it('trata una plataforma compartida como sitio propio (paypal.github.io)', () => {
    expect(domainKey('paypal.github.io')).toBe('paypal.github.io');
  });

  it('null con una IP: no es un dominio', () => {
    expect(domainKey('1.2.3.4')).toBeNull();
  });

  it('null con un host sin sufijo público (localhost)', () => {
    expect(domainKey('localhost')).toBeNull();
  });
});

describe('packHashes / hasHash', () => {
  // HASH_BYTES = 6: basta con variar el primer byte para un orden claro.
  const h = (n: number) => new Uint8Array([n, 0, 0, 0, 0, 0]);

  it('ordena y quita duplicados', () => {
    const block = packHashes([h(5), h(1), h(5), h(3)]);
    expect(block.length).toBe(3 * HASH_BYTES);
    expect([...block]).toEqual([...h(1), ...h(3), ...h(5)]);
  });

  it('encuentra el primer y el último elemento', () => {
    const block = packHashes([h(1), h(2), h(3), h(4), h(5)]);
    expect(hasHash(block, h(1))).toBe(true);
    expect(hasHash(block, h(5))).toBe(true);
    expect(hasHash(block, h(3))).toBe(true);
  });

  it('rechaza una huella que no está, aunque quede entre dos que sí', () => {
    const block = packHashes([h(1), h(3), h(5)]);
    expect(hasHash(block, h(2))).toBe(false);
    expect(hasHash(block, h(0))).toBe(false);
    expect(hasHash(block, h(9))).toBe(false);
  });

  it('un bloque vacío nunca encuentra nada', () => {
    expect(hasHash(new Uint8Array(0), h(1))).toBe(false);
  });
});

describe('verifyBlocklist', () => {
  async function keyPair() {
    const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    const raw = await crypto.subtle.exportKey('raw', publicKey);
    return { privateKey, publicKeyB64: Buffer.from(raw).toString('base64') };
  }

  async function build(domains: string[], urls: string[]) {
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
    return { meta, metaBytes, bin };
  }

  async function sign(privateKey: CryptoKey, metaBytes: Uint8Array) {
    const sig = await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, metaBytes as BufferSource);
    return Buffer.from(sig).toString('base64');
  }

  it('con una firma válida, devuelve una lista que distingue dominio entero de URL exacta', async () => {
    const { privateKey, publicKeyB64 } = await keyPair();
    const { metaBytes, bin } = await build(['evil.example'], ['popular.example/phish']);
    const sig = await sign(privateKey, metaBytes);

    const list = await verifyBlocklist(metaBytes, sig, bin, publicKeyB64);

    // Dominio entero marcado: cualquier URL de ese dominio (o subdominio) está en la lista.
    expect(await list.has('https://sub.evil.example/x')).toBe(true);
    expect(await list.has('https://evil.example/lo-que-sea')).toBe(true);

    // URL exacta: solo esa, no otras rutas (ni la portada) del mismo dominio.
    expect(await list.has('https://popular.example/phish')).toBe(true);
    expect(await list.has('https://popular.example/otra-ruta')).toBe(false);
    expect(await list.has('https://popular.example/')).toBe(false);

    // Nada que ver con la lista.
    expect(await list.has('https://ejemplo-limpio.test/')).toBe(false);
  });

  it('rechaza una firma que no es de esos bytes de meta.json', async () => {
    const { privateKey, publicKeyB64 } = await keyPair();
    const { metaBytes, bin } = await build(['evil.example'], []);
    const { metaBytes: otraMetaBytes } = await build(['otro.example'], []);
    const sig = await sign(privateKey, otraMetaBytes); // firma de un meta.json distinto

    await expect(verifyBlocklist(metaBytes, sig, bin, publicKeyB64)).rejects.toThrow();
  });

  it('rechaza el meta.json manipulado tras firmarlo', async () => {
    const { privateKey, publicKeyB64 } = await keyPair();
    const { meta, metaBytes, bin } = await build(['evil.example'], []);
    const sig = await sign(privateKey, metaBytes);
    const tampered = new TextEncoder().encode(JSON.stringify({ ...meta, generated: '2000-01-01T00:00:00.000Z' }));

    await expect(verifyBlocklist(tampered, sig, bin, publicKeyB64)).rejects.toThrow();
  });

  it('rechaza blocklist.bin manipulado (ya no coincide con el sha256 de meta.json)', async () => {
    const { privateKey, publicKeyB64 } = await keyPair();
    const { metaBytes, bin } = await build(['evil.example'], []);
    const sig = await sign(privateKey, metaBytes);
    const tamperedBin = new Uint8Array(bin);
    tamperedBin[0] = (tamperedBin[0] ?? 0) ^ 0xff;

    await expect(verifyBlocklist(metaBytes, sig, tamperedBin, publicKeyB64)).rejects.toThrow();
  });

  it('rechaza con la clave pública equivocada', async () => {
    const signer = await keyPair();
    const other = await keyPair();
    const { metaBytes, bin } = await build(['evil.example'], []);
    const sig = await sign(signer.privateKey, metaBytes);

    await expect(verifyBlocklist(metaBytes, sig, bin, other.publicKeyB64)).rejects.toThrow();
  });

  it('rechaza una versión distinta de 1', async () => {
    const { privateKey, publicKeyB64 } = await keyPair();
    const { meta, bin } = await build(['evil.example'], []);
    // Se firma el meta ya alterado para que solo falle la comprobación de versión, no la firma.
    const tamperedMetaBytes = new TextEncoder().encode(JSON.stringify({ ...meta, version: 2 }));
    const sig = await sign(privateKey, tamperedMetaBytes);

    await expect(verifyBlocklist(tamperedMetaBytes, sig, bin, publicKeyB64)).rejects.toThrow();
  });
});
