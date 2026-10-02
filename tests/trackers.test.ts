import { describe, expect, it } from 'vitest';
import { stripTrackers } from '@/lib/data/trackers';

describe('stripTrackers', () => {
  it('quita utm_source, utm_medium y fbclid', () => {
    const r = stripTrackers('https://example.com/?utm_source=x&utm_medium=y&fbclid=z&id=1');
    expect(r.href).toBe('https://example.com/?id=1');
    expect(r.removed).toEqual(['utm_source', 'utm_medium', 'fbclid']);
  });

  it('conserva exactamente la codificación de los parámetros que no son de rastreo', () => {
    const r = stripTrackers('https://example.com/?q=a%20b&utm_source=x');
    expect(r.href).toBe('https://example.com/?q=a%20b');
  });

  it('conserva el orden de los parámetros que quedan', () => {
    const r = stripTrackers('https://example.com/?b=2&utm_source=x&a=1');
    expect(r.href).toBe('https://example.com/?b=2&a=1');
  });

  it('detecta los nombres sin importar mayúsculas/minúsculas', () => {
    const r = stripTrackers('https://example.com/?UTM_Source=x&q=1');
    expect(r.href).toBe('https://example.com/?q=1');
    expect(r.removed).toEqual(['UTM_Source']);
  });

  it('si no hay nada que quitar, devuelve el mismo href (misma cadena)', () => {
    const href = 'https://example.com/?q=a%20b&id=1';
    const r = stripTrackers(href);
    expect(r.href).toBe(href);
    expect(r.removed).toEqual([]);
  });

  it('quita el "?" si no queda ningún parámetro', () => {
    const r = stripTrackers('https://example.com/path?utm_source=x&fbclid=y');
    expect(r.href).toBe('https://example.com/path');
  });

  it('conserva el fragmento (#) y no toca lo que haya dentro', () => {
    const r = stripTrackers('https://example.com/?utm_source=x#utm_source=y');
    expect(r.href).toBe('https://example.com/#utm_source=y');
  });

  it('una URL no válida se devuelve sin cambios', () => {
    const href = 'no es una url';
    const r = stripTrackers(href);
    expect(r).toEqual({ href, removed: [] });
  });

  it('no quita "utm" sin guion bajo ni "xutm_source" (no es el prefijo utm_)', () => {
    const r = stripTrackers('https://example.com/?utm=1&xutm_source=2');
    expect(r.href).toBe('https://example.com/?utm=1&xutm_source=2');
    expect(r.removed).toEqual([]);
  });
});
