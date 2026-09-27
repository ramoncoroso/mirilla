import { describe, expect, it } from 'vitest';
import { en, es } from '@/locales/messages';

const placeholders = (s: string) => [...s.matchAll(/\$\d/g)].map((m) => m[0]).sort();

describe('traducciones', () => {
  it('cada texto tiene las mismas sustituciones ($1, $2...) en inglés y en castellano', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(es[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it('respetan los límites de las tiendas (nombre ≤ 45, descripción ≤ 132)', () => {
    for (const m of [en, es]) {
      expect(m.extName.length).toBeLessThanOrEqual(45);
      expect(m.extDescription.length).toBeLessThanOrEqual(132);
    }
  });
});
