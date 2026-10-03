// pruebas de lib/rdap.ts: antigüedad de dominio vía RDAP (ver tests/history.test.ts para el estilo).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ageInDays, domainAge, rdapBase, registrationDate, type Bootstrap } from '@/lib/rdap';

const BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json';

const bootstrap: Bootstrap = {
  services: [
    [['com', 'net'], ['https://rdap.verisign.com/com/v1/']],
    [['org'], ['http://insecure.example/', 'https://rdap.org.example/rdap']],
    [['kg'], ['http://only-http.example/']],
  ],
};

const rdapResponse = (iso: string) => ({ events: [{ eventAction: 'registration', eventDate: iso }] });

describe('rdap', () => {
  beforeEach(() => fakeBrowser.reset());

  describe('rdapBase', () => {
    it('encuentra la base https del TLD', () => {
      expect(rdapBase(bootstrap, 'example.com')).toBe('https://rdap.verisign.com/com/v1/');
    });

    it('añade la barra final si falta', () => {
      expect(rdapBase(bootstrap, 'example.org')).toBe('https://rdap.org.example/rdap/');
    });

    it('prefiere https cuando hay varias URLs', () => {
      expect(rdapBase(bootstrap, 'example.org')?.startsWith('https://')).toBe(true);
    });

    it('devuelve null si el TLD solo tiene http', () => {
      expect(rdapBase(bootstrap, 'example.kg')).toBeNull();
    });

    it('devuelve null si el TLD no está en la lista', () => {
      expect(rdapBase(bootstrap, 'example.es')).toBeNull();
    });

    it('no distingue mayúsculas de minúsculas', () => {
      expect(rdapBase(bootstrap, 'EXAMPLE.COM')).toBe('https://rdap.verisign.com/com/v1/');
    });

    it('resuelve dominios con varias etiquetas por su TLD', () => {
      expect(rdapBase(bootstrap, 'a.b.example.com')).toBe('https://rdap.verisign.com/com/v1/');
    });
  });

  describe('registrationDate', () => {
    it('elige el evento «registration» entre otros', () => {
      const date = registrationDate({
        events: [
          { eventAction: 'last changed', eventDate: '2020-01-01T00:00:00Z' },
          { eventAction: 'registration', eventDate: '2010-05-05T00:00:00Z' },
          { eventAction: 'expiration', eventDate: '2030-01-01T00:00:00Z' },
        ],
      });
      expect(date?.toISOString()).toBe(new Date('2010-05-05T00:00:00Z').toISOString());
    });

    it('null si no hay evento de registro', () => {
      expect(registrationDate({ events: [{ eventAction: 'expiration', eventDate: '2030-01-01T00:00:00Z' }] })).toBeNull();
    });

    it('null si «events» no es un array', () => {
      expect(registrationDate({ events: 'no es un array' })).toBeNull();
      expect(registrationDate({})).toBeNull();
    });

    it('null si la fecha no es válida', () => {
      expect(registrationDate({ events: [{ eventAction: 'registration', eventDate: 'no es una fecha' }] })).toBeNull();
    });

    it('null con entrada nula', () => {
      expect(registrationDate(null)).toBeNull();
    });
  });

  describe('ageInDays', () => {
    it('calcula los días con un «ahora» explícito', () => {
      const registered = new Date('2024-01-01T00:00:00Z');
      const now = new Date('2024-01-11T00:00:00Z');
      expect(ageInDays(registered, now)).toBe(10);
    });

    it('nunca es negativo', () => {
      const future = new Date(Date.now() + 86_400_000);
      expect(ageInDays(future)).toBe(0);
    });
  });

  describe('domainAge', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('camino correcto: pide el bootstrap de IANA y luego el dominio al registro', async () => {
      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        if (url === BOOTSTRAP_URL) return new Response(JSON.stringify(bootstrap), { status: 200 });
        if (url === 'https://rdap.verisign.com/com/v1/domain/example.com') {
          expect((init?.headers as Record<string, string> | undefined)?.Accept).toBe('application/rdap+json');
          return new Response(JSON.stringify(rdapResponse('2015-03-20T00:00:00Z')), { status: 200 });
        }
        throw new Error(`url inesperada: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await domainAge('example.com');
      expect(result.status).toBe('ok');
      if (result.status === 'ok') {
        expect(result.registered).toBe(new Date('2015-03-20T00:00:00Z').toISOString());
        expect(result.days).toBeGreaterThan(0);
      }
    });

    it('cachea el bootstrap: la segunda consulta no vuelve a pedir dns.json', async () => {
      const fetchMock = vi.fn(async (url: string) => {
        if (url === BOOTSTRAP_URL) return new Response(JSON.stringify(bootstrap), { status: 200 });
        return new Response(JSON.stringify(rdapResponse('2015-03-20T00:00:00Z')), { status: 200 });
      });
      vi.stubGlobal('fetch', fetchMock);

      await domainAge('example.com');
      await domainAge('example.com');

      expect(fetchMock.mock.calls.filter(([url]) => url === BOOTSTRAP_URL)).toHaveLength(1);
    });

    it('TLD sin RDAP: no disponible, sin pedir el dominio', async () => {
      const fetchMock = vi.fn(async (url: string) => {
        if (url === BOOTSTRAP_URL) return new Response(JSON.stringify(bootstrap), { status: 200 });
        throw new Error(`no debería pedirse: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      expect(await domainAge('example.es')).toEqual({ status: 'unavailable' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('404 del registro: no disponible', async () => {
      const fetchMock = vi.fn(async (url: string) => {
        if (url === BOOTSTRAP_URL) return new Response(JSON.stringify(bootstrap), { status: 200 });
        return new Response(null, { status: 404 });
      });
      vi.stubGlobal('fetch', fetchMock);

      expect(await domainAge('example.com')).toEqual({ status: 'unavailable' });
    });

    it('500 del registro: error', async () => {
      const fetchMock = vi.fn(async (url: string) => {
        if (url === BOOTSTRAP_URL) return new Response(JSON.stringify(bootstrap), { status: 200 });
        return new Response(null, { status: 500 });
      });
      vi.stubGlobal('fetch', fetchMock);

      expect(await domainAge('example.com')).toEqual({ status: 'error' });
    });

    it('un fetch que lanza también da error', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new Error('red caída');
        }),
      );

      expect(await domainAge('example.com')).toEqual({ status: 'error' });
    });

    it('dominios inválidos («» y «localhost»): no disponible, sin llamar a fetch', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      expect(await domainAge('')).toEqual({ status: 'unavailable' });
      expect(await domainAge('localhost')).toEqual({ status: 'unavailable' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('«a b.com» (con espacio) tampoco pasa la validación', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      expect(await domainAge('a b.com')).toEqual({ status: 'unavailable' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('una IP («1.2.3.4») no se consulta', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      expect(await domainAge('1.2.3.4')).toEqual({ status: 'unavailable' });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
