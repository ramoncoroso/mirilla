import { describe, expect, it } from 'vitest';
import { editDistance, findLookalike, hasMixedScripts, idnInfo, references, swapNormalize, trustedReference } from '@/lib/lookalike';
import { mainDomain } from '@/lib/url-safety';

const refs = references();
function look(href: string, r = refs) {
  const url = new URL(href);
  const found = findLookalike(url.hostname, mainDomain(url.hostname), url.pathname, r);
  return found && { kind: found.kind, primary: found.ref.primary };
}

describe('findLookalike', () => {
  it('los dominios oficiales no imitan a nadie', () => {
    for (const u of ['https://www.paypal.com/signin', 'https://www.amazon.es/', 'https://login.microsoftonline.com/', 'https://www.correos.es/']) {
      expect(look(u), u).toBeNull();
    }
  });

  it('una marca en el host de otro dominio', () => {
    expect(look('https://paypal.com.cuenta-verificar.example/')).toEqual({ kind: 'brand-host', primary: 'paypal.com' });
    expect(look('https://paypal-secure.example/')?.kind).toBe('brand-host');
    expect(look('https://mypaypalaccount.example/')?.kind).toBe('brand-host');
    expect(look('https://www.paypal.github.io/')?.kind).toBe('brand-host');
  });

  it('una marca en la ruta es más débil', () => {
    expect(look('https://evil.example/paypal/login')).toEqual({ kind: 'brand-path', primary: 'paypal.com' });
    // Dentro de otra palabra de la ruta no cuenta.
    expect(look('https://evil.example/paypalooza')).toBeNull();
  });

  it('sustituciones típicas y erratas', () => {
    expect(look('https://paypa1.com/')).toEqual({ kind: 'typo-swap', primary: 'paypal.com' });
    expect(look('https://rnicrosoft.com/')?.kind).toBe('typo-swap');
    expect(look('https://arnazon.es/')?.kind).toBe('typo-swap');
    expect(look('https://microsfot.com/')?.kind).toBe('typo-edit');
    expect(look('https://netfliix.com/')?.kind).toBe('typo-edit');
  });

  it('los nombres cortos no se comparan por erratas', () => {
    expect(look('https://dhx.com/')).toBeNull();
  });

  it('homógrafos: letras de otro alfabeto que se leen como el oficial', () => {
    expect(look('https://аpple.com/')).toEqual({ kind: 'homograph', primary: 'apple.com' });
    expect(look('https://раураl.com/')).toEqual({ kind: 'homograph', primary: 'paypal.com' });
    expect(look('https://pаypal-login.example/')?.kind).toBe('brand-host');
  });

  it('protege los sitios de confianza del usuario', () => {
    const r = references(['mibancolocal.es']);
    expect(look('https://mibancolocal.es/', r)).toBeNull();
    expect(look('https://mibancolocal-acceso.example/', r)).toEqual({ kind: 'brand-host', primary: 'mibancolocal.es' });
    expect(look('https://mibancoloca1.es/', r)).toEqual({ kind: 'typo-swap', primary: 'mibancolocal.es' });
  });

  it('un sitio de confianza con nombre corto solo cuenta como palabra completa', () => {
    expect(trustedReference('cajal.es')).toMatchObject({ keywords: [], tokens: ['cajal'] });
  });
});

describe('idnInfo', () => {
  it('los dominios internacionales legítimos no se leen como otro', () => {
    expect(idnInfo(new URL('https://españa.es').hostname)).toEqual({ unicode: 'españa.es', readsAs: null, mixedScripts: false });
    expect(idnInfo(new URL('https://日本語.jp').hostname)?.mixedScripts).toBe(false);
    expect(idnInfo('example.com')).toBeNull();
  });

  it('detecta mezclas de alfabetos y dominios que se leen como ASCII', () => {
    expect(idnInfo(new URL('https://pаypal.example').hostname)?.mixedScripts).toBe(true);
    expect(idnInfo(new URL('https://сосо.com').hostname)?.readsAs).toBe('coco.com');
  });
});

describe('utilidades', () => {
  it('editDistance cuenta las transposiciones como una errata', () => {
    expect(editDistance('microsoft', 'microsfot')).toBe(1);
    expect(editDistance('paypal', 'paypal')).toBe(0);
    expect(editDistance('abc', 'xyz', 1)).toBeGreaterThan(1);
  });

  it('swapNormalize', () => {
    expect(swapNormalize('rnicr0soft')).toBe('microsoft');
    expect(swapNormalize('vvikipedia')).toBe('wikipedia');
  });

  it('hasMixedScripts admite las mezclas del japonés y el coreano', () => {
    expect(hasMixedScripts('ソニーsony')).toBe(false);
    expect(hasMixedScripts('аpple')).toBe(true);
    expect(hasMixedScripts('españa')).toBe(false);
  });
});
