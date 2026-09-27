import { describe, expect, it } from 'vitest';
import { hiddenChars, revealHidden } from '@/lib/unicode';

describe('caracteres invisibles y controles bidi', () => {
  it('los detecta y los hace visibles', () => {
    const text = 'https://evil.example/‮moc.lapyap//:sptth';
    expect(hiddenChars(text)).toEqual(['U+202E']);
    expect(revealHidden(text)).toBe('https://evil.example/⟨U+202E⟩moc.lapyap//:sptth');
    expect(hiddenChars('a​b⁦c⁩﻿')).toEqual(['U+200B', 'U+2066', 'U+2069', 'U+FEFF']);
  });

  it('no toca texto normal ni emojis compuestos (ZWJ)', () => {
    expect(hiddenChars('Hola, ¿qué tal? 👩‍💻')).toEqual([]);
    expect(revealHidden('ES91 2100')).toBe('ES91 2100');
  });
});
