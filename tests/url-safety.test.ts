import { describe, expect, it } from 'vitest';
import { analyzeUrl, highlightRange, mainDomain } from '@/lib/url-safety';

const levels = (url: string) => analyzeUrl(url).findings.map((f) => f.level);
const messages = (url: string) => analyzeUrl(url).findings.map((f) => f.message);

describe('analyzeUrl', () => {
  it('una URL https normal no genera avisos', () => {
    expect(analyzeUrl('https://www.labelic.com/precios')).toEqual({
      openable: true,
      host: 'www.labelic.com',
      href: 'https://www.labelic.com/precios',
      findings: [],
    });
  });

  it('bloquea esquemas que ejecutan código', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>x</script>', 'vbscript:x', 'file:///etc/passwd', ' JavaScript:alert(1)']) {
      const r = analyzeUrl(url);
      expect(r.openable, url).toBe(false);
      expect(r.findings[0]?.level).toBe('danger');
    }
  });

  it('no abre esquemas que no son web', () => {
    expect(analyzeUrl('ftp://x.com').openable).toBe(false);
  });

  it('detecta el truco usuario@dominio', () => {
    const r = analyzeUrl('https://www.paypal.com@evil.example/login');
    expect(r.host).toBe('evil.example');
    expect(levels('https://www.paypal.com@evil.example/login')).toContain('danger');
  });

  it('detecta dominios homógrafos (punycode)', () => {
    // "аpple.com" con "а" cirílica
    expect(analyzeUrl('https://аpple.com').host).toMatch(/^xn--/);
    expect(levels('https://аpple.com')).toContain('danger');
  });

  it('avisa de http, IPs, acortadores y puertos raros', () => {
    expect(levels('http://example.com')).toEqual(['warn']);
    expect(levels('https://192.168.1.10/admin')).toEqual(['warn']);
    expect(levels('https://bit.ly/abc')).toEqual(['info']);
    expect(levels('https://example.com:8443/')).toEqual(['info']);
  });

  it('palabras de phishing: pista (info) si van solas, aviso si hay otras señales', () => {
    expect(analyzeUrl('https://secure-login.example.com').findings).toEqual([{ level: 'info', message: 'urlPhishingWords' }]);
    expect(levels('http://secure-login.example.com')).toEqual(['warn', 'warn']);
  });

  it('el punto final del host no esquiva las comprobaciones', () => {
    expect(analyzeUrl('https://bit.ly./x').host).toBe('bit.ly');
    expect(messages('https://bit.ly./x')).toContain('urlShortener');
  });

  it('detecta redirecciones abiertas hacia otro dominio', () => {
    expect(analyzeUrl('https://www.google.com/url?q=https://evil.example/login').findings).toContainEqual({
      level: 'warn',
      message: 'urlRedirect',
      args: ['q', 'evil.example'],
    });
    expect(messages('https://example.com/?next=//evil.example/x')).toContain('urlRedirect');
    // Una redirección dentro del mismo dominio no es sospechosa.
    expect(messages('https://www.example.com/login?next=https://example.com/panel')).not.toContain('urlRedirect');
  });

  it('señala las plataformas donde cualquiera crea subdominios', () => {
    expect(analyzeUrl('https://paypal.github.io/login').findings).toContainEqual({ level: 'info', message: 'urlSharedHosting', args: ['github.io'] });
    expect(messages('https://evil.pages.dev/')).toContain('urlSharedHosting');
    expect(messages('https://www.labelic.com/')).not.toContain('urlSharedHosting');
  });

  it('muestra la URL que abriría el navegador, normalizada', () => {
    expect(analyzeUrl('https://%70aypal.com/').href).toBe('https://paypal.com/');
    expect(analyzeUrl('HTTPS://EXAMPLE.COM/A').href).toBe('https://example.com/A');
  });
});

describe('mainDomain (Public Suffix List)', () => {
  it('dominio registrable, incluidos sufijos de dos niveles', () => {
    expect(mainDomain('www.labelic.com')).toBe('labelic.com');
    expect(mainDomain('login.bbc.co.uk')).toBe('bbc.co.uk');
    expect(mainDomain('paypal.com.evil.com')).toBe('evil.com');
    expect(mainDomain('10.0.0.1')).toBe('10.0.0.1');
    expect(mainDomain('example.com.')).toBe('example.com');
  });

  it('en plataformas compartidas, el sitio concreto y no la plataforma', () => {
    expect(mainDomain('paypal.github.io')).toBe('paypal.github.io');
    expect(mainDomain('evil.pages.dev')).toBe('evil.pages.dev');
  });
});

describe('highlightRange', () => {
  const hl = (href: string) => {
    const r = highlightRange(href, analyzeUrl(href).host);
    return r ? href.slice(r[0], r[1]) : null;
  };

  it('resalta el dominio real, no lo que aparece antes de la @ ni en la ruta', () => {
    expect(hl('https://www.paypal.com@evil.example/paypal.com')).toBe('evil.example');
    expect(hl('https://paypal.com.evil.com/')).toBe('evil.com');
    expect(hl('https://evil.example/https://www.paypal.com')).toBe('evil.example');
    expect(hl('https://shop.example:8443/x')).toBe('shop.example');
  });

  it('no resalta un sufijo que no empieza en un límite de etiqueta', () => {
    expect(highlightRange('https://notexample.com/', 'example.com')).toBeNull();
  });
});
