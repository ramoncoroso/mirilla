import { describe, expect, it } from 'vitest';
import { parse } from 'tldts';
import { BRANDS } from '@/lib/data/brands';

const ASCII_LOWER = /^[a-z0-9.-]+$/;

describe('BRANDS', () => {
  it('cada marca incluye primary dentro de domains', () => {
    for (const b of BRANDS) {
      expect(b.domains, b.name).toContain(b.primary);
    }
  });

  it('dominios, keywords y tokens están en minúsculas ASCII', () => {
    for (const b of BRANDS) {
      for (const d of b.domains) expect(d, `${b.name}: ${d}`).toMatch(ASCII_LOWER);
      for (const k of b.keywords) expect(k, `${b.name}: ${k}`).toMatch(/^[a-z]+$/);
      for (const t of b.tokens) expect(t, `${b.name}: ${t}`).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('las keywords tienen al menos 5 letras', () => {
    for (const b of BRANDS) {
      for (const k of b.keywords) {
        expect(k.length, `${b.name}: ${k}`).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it('no hay marcas duplicadas por nombre', () => {
    const names = BRANDS.map((b) => b.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('ningún dominio se repite dentro de la misma marca', () => {
    for (const b of BRANDS) {
      expect(new Set(b.domains).size, b.name).toBe(b.domains.length);
    }
  });

  it('ningún dominio pertenece a dos marcas', () => {
    const owner = new Map<string, string>();
    for (const b of BRANDS) {
      for (const d of b.domains) {
        const prev = owner.get(d);
        expect(prev, `${d} ya está en ${prev}, repetido en ${b.name}`).toBeUndefined();
        owner.set(d, b.name);
      }
    }
  });

  it('cada dominio es su propio dominio registrable y no es un dominio privado (PSL)', () => {
    for (const b of BRANDS) {
      for (const d of b.domains) {
        const parsed = parse(d, { allowPrivateDomains: true });
        expect(parsed.domain, `${b.name}: ${d}`).toBe(d);
        expect(parsed.isPrivate, `${b.name}: ${d} es un dominio privado (plataforma compartida)`).toBe(false);
      }
    }
  });
});
