import { describe, expect, it } from 'vitest';
import { extractLinks } from '@/lib/links';

describe('extractLinks', () => {
  it('encuentra los enlaces de un texto y quita la puntuación de la frase', () => {
    expect(extractLinks('Paga aquí: https://evil.example/pago. Gracias')).toEqual(['https://evil.example/pago']);
    expect(extractLinks('Tu paquete (https://correos-envio.example/x), ¡ya!')).toEqual(['https://correos-envio.example/x']);
  });

  it('completa los que empiezan por www. y no repite', () => {
    expect(extractLinks('www.ejemplo.es y www.ejemplo.es, también http://a.example')).toEqual(['https://www.ejemplo.es', 'http://a.example']);
  });

  it('respeta los paréntesis que forman parte del enlace', () => {
    expect(extractLinks('Ver https://es.wikipedia.org/wiki/Mirilla_(puerta).')).toEqual(['https://es.wikipedia.org/wiki/Mirilla_(puerta)']);
  });

  it('no inventa enlaces', () => {
    expect(extractLinks('Lote:42 SN:ABC www. nada')).toEqual([]);
    expect(extractLinks('javascript:alert(1)')).toEqual([]);
  });
});
