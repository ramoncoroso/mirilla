import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { addTrustedSite, getTrustedSites, linkDomains, loadContextData, normalizeSite, removeTrustedSite, toAssessContext } from '@/lib/context';
import { addToHistory, setHistoryEnabled } from '@/lib/history';
import { assessUrl } from '@/lib/verdict';

const code = (text: string) => ({ text, format: 'QR', gs1: false });

describe('normalizeSite', () => {
  it('saca el dominio registrable de una URL completa, con mayúsculas y query', () => {
    expect(normalizeSite('https://www.MiBanco.es/login?x=1')).toBe('mibanco.es');
  });

  it('acepta un dominio sin esquema', () => {
    expect(normalizeSite('mibanco.es')).toBe('mibanco.es');
  });

  it('ignora espacios y mayúsculas, y quita el «www.»', () => {
    expect(normalizeSite('  WWW.MIBANCO.ES ')).toBe('mibanco.es');
  });

  it('respeta los sufijos de varios niveles (co.uk)', () => {
    expect(normalizeSite('cuenta.bbva.co.uk')).toBe('bbva.co.uk');
  });

  it.each([
    ['', 'vacío'],
    ['localhost', 'sin sufijo público'],
    ['192.168.1.1', 'una IP'],
    ['javascript:alert(1)', 'un esquema peligroso'],
    ['hola mundo', 'texto sin forma de dominio'],
  ])('devuelve null para %s (%s)', (input) => {
    expect(normalizeSite(input)).toBeNull();
  });
});

describe('sitios de confianza', () => {
  beforeEach(() => fakeBrowser.reset());

  it('añade el dominio normalizado y lo devuelve tal cual se guardó', async () => {
    const saved = await addTrustedSite('https://www.MiBanco.es/login');
    expect(saved).toBe('mibanco.es');
    expect(await getTrustedSites()).toEqual(['mibanco.es']);
  });

  it('no duplica un sitio ya guardado, aunque se escriba distinto', async () => {
    await addTrustedSite('mibanco.es');
    await addTrustedSite('https://WWW.MIBANCO.ES/cuentas');
    expect(await getTrustedSites()).toEqual(['mibanco.es']);
  });

  it('con una entrada no válida no guarda nada y devuelve null', async () => {
    expect(await addTrustedSite('localhost')).toBeNull();
    expect(await getTrustedSites()).toEqual([]);
  });

  it('elimina un sitio de confianza', async () => {
    await addTrustedSite('mibanco.es');
    await addTrustedSite('otrobanco.es');
    await removeTrustedSite('mibanco.es');
    expect(await getTrustedSites()).toEqual(['otrobanco.es']);
  });
});

describe('linkDomains', () => {
  it('el texto entero es una URL', () => {
    expect(linkDomains(['https://example.com/path'])).toEqual(['example.com']);
  });

  it('enlaces escondidos dentro de un texto, incluido un «www.» sin esquema', () => {
    expect(linkDomains(['Paga aquí: https://pago.example.com/x y www.otro.es'])).toEqual(['example.com', 'otro.es']);
  });

  it('contenido que no es web no da ningún dominio', () => {
    expect(linkDomains(['WIFI:S:Casa;T:WPA;P:12345;;', 'tel:+34600000000'])).toEqual([]);
  });

  it('no repite un dominio que aparece varias veces', () => {
    expect(linkDomains(['https://a.example/foo', 'https://a.example/bar'])).toEqual(['a.example']);
  });
});

describe('loadContextData', () => {
  beforeEach(() => fakeBrowser.reset());

  it('con historial, «known» lleva los dominios ya leídos y «trusted» los sitios de confianza', async () => {
    await addToHistory([code('https://banco1.example/login')], '');
    await addToHistory([code('Visita https://banco2.example/promo')], '');
    await addTrustedSite('mitrusted.example');

    const data = await loadContextData();
    expect(data.trusted).toEqual(['mitrusted.example']);
    expect(data.known?.slice().sort()).toEqual(['banco1.example', 'banco2.example']);
  });

  it('con el historial desactivado, «known» es null', async () => {
    await addToHistory([code('https://banco1.example/login')], '');
    await setHistoryEnabled(false);

    const data = await loadContextData();
    expect(data.known).toBeNull();
  });
});

describe('toAssessContext + assessUrl (integración)', () => {
  it('un sitio de confianza da veredicto "trusted", con el aviso en primer lugar', () => {
    const ctx = toAssessContext({ trusted: ['mibanco.es'], known: ['mibanco.es'] });
    const result = assessUrl('https://mibanco.es/login', ctx);
    expect(result.verdict).toBe('trusted');
    expect(result.findings[0]?.message).toBe('verdictTrustedDetail');
  });

  it('una imitación de un sitio de confianza da "danger"', () => {
    const ctx = toAssessContext({ trusted: ['mibancolocal.es'], known: [] });
    const result = assessUrl('https://mibancoloca1.es/', ctx);
    expect(result.verdict).toBe('danger');
    expect(result.findings.some((f) => f.message === 'urlImitatesTrusted')).toBe(true);
  });

  it('un dominio que no está en «known» da el aviso de primera visita', () => {
    const ctx = toAssessContext({ trusted: [], known: [] });
    const result = assessUrl('https://www.labelic.com/', ctx);
    expect(result.findings.some((f) => f.message === 'urlFirstVisit')).toBe(true);
  });

  it('con el historial desactivado avisa de que falta la señal, sin cambiar el veredicto', () => {
    const ctx = toAssessContext({ trusted: [], known: null });
    const result = assessUrl('https://www.labelic.com/', ctx);
    expect(result.findings.some((f) => f.message === 'urlFamiliarityOff')).toBe(true);
    expect(result.verdict).toBe('clear');
  });
});
