import { describe, expect, it } from 'vitest';
import { analyzeUrl, mainDomain } from '@/lib/url-safety';

const levels = (url: string) => analyzeUrl(url).findings.map((f) => f.level);

describe('analyzeUrl', () => {
  it('una URL https normal no genera avisos', () => {
    expect(analyzeUrl('https://www.labelic.com/precios')).toEqual({ openable: true, host: 'www.labelic.com', findings: [] });
  });

  it('bloquea esquemas que ejecutan código', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>x</script>', 'vbscript:x', 'file:///etc/passwd']) {
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

  it('marca palabras de phishing solo si ya hay otras señales', () => {
    expect(levels('https://secure-login.example.com')).toEqual([]);
    expect(levels('http://secure-login.example.com')).toEqual(['warn', 'warn']);
  });
});

describe('mainDomain', () => {
  it('extrae el dominio registrable aproximado', () => {
    expect(mainDomain('www.labelic.com')).toBe('labelic.com');
    expect(mainDomain('login.bbc.co.uk')).toBe('bbc.co.uk');
    expect(mainDomain('a.b.ejemplo.com.es')).toBe('ejemplo.com.es');
    expect(mainDomain('10.0.0.1')).toBe('10.0.0.1');
  });
});
