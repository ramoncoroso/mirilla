import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { addToHistory, clearHistory, getHistory, originOf, setHistoryEnabled } from '@/lib/history';

const code = (text: string) => ({ text, format: 'QR', gs1: false });

describe('historial', () => {
  beforeEach(() => fakeBrowser.reset());

  it('guarda solo el origen de la página, no la URL completa', async () => {
    await addToHistory([code('A')], 'https://mail.example/inbox?token=SECRETO#msg');
    expect((await getHistory())[0]?.source).toBe('https://mail.example');
    expect(originOf('chrome-extension://abc/popup.html')).toBe('');
    expect(originOf('no es una url')).toBe('');
  });

  it('lecturas simultáneas no se pisan', async () => {
    await Promise.all([addToHistory([code('A')], ''), addToHistory([code('B')], ''), addToHistory([code('C')], '')]);
    expect((await getHistory()).map((h) => h.text).sort()).toEqual(['A', 'B', 'C']);
  });

  it('una lectura que termina justo después de desactivar el historial no lo vuelve a escribir', async () => {
    const pending = addToHistory([code('A')], '');
    const disabling = setHistoryEnabled(false);
    await Promise.all([pending, disabling]);
    await addToHistory([code('B')], '');
    expect(await getHistory()).toEqual([]);
  });

  it('sin duplicados, lo más reciente primero y como mucho 50', async () => {
    for (let i = 0; i < 60; i++) await addToHistory([code(`C${i}`)], '');
    await addToHistory([code('C10')], '');
    const h = await getHistory();
    expect(h).toHaveLength(50);
    expect(h[0]?.text).toBe('C10');
    expect(h.filter((e) => e.text === 'C10')).toHaveLength(1);
    await clearHistory();
    expect(await getHistory()).toEqual([]);
  });
});
