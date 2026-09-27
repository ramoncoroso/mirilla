// Solo en la build E2E (se importa tras `if (__E2E__)`, así que no llega a la build publicada).
// geckodriver no permite ejecutar scripts en páginas moz-extension://, pero sí escribir y pulsar:
// el test escribe una orden JSON, pulsa el botón y lee el resultado. Solo hay órdenes predefinidas
// (la CSP de la extensión prohíbe eval).

import { browser } from 'wxt/browser';

type Command =
  | { op: 'clear' }
  | { op: 'history' }
  | { op: 'tabIdByUrl'; url: string }
  | { op: 'activate'; tabId: number }
  | { op: 'setZoom'; tabId: number; zoom: number }
  | { op: 'roundTrip'; text: string }
  | { op: 'menu'; fn: 'readImage' | 'startSelection' | 'scanVisible'; tabId: number; arg?: string };

async function run(cmd: Command): Promise<unknown> {
  switch (cmd.op) {
    case 'clear':
      return browser.storage.local.clear();
    case 'history': {
      const { history } = await browser.storage.local.get('history');
      return ((history as { text: string }[] | undefined) ?? []).map((h) => h.text);
    }
    case 'tabIdByUrl':
      // Los patrones de tabs.query no admiten puertos: se compara la URL exacta.
      return (await browser.tabs.query({})).find((t) => t.url === cmd.url)?.id;
    case 'activate':
      return void (await browser.tabs.update(cmd.tabId, { active: true }));
    case 'setZoom':
      return browser.tabs.setZoom(cmd.tabId, cmd.zoom);
    case 'roundTrip': {
      // Genera un QR con el codificador y lo vuelve a leer con el lector (los dos WASM, con la CSP real).
      const { generateQr } = await import('./generate');
      const { decodeBlob } = await import('./decode');
      return (await decodeBlob(await generateQr(cmd.text))).map((c) => c.text);
    }
    case 'menu': {
      const bg = (await browser.runtime.getBackgroundPage()) as unknown as { __mirillaTest: Record<string, (...a: unknown[]) => Promise<void>> };
      const api = bg.__mirillaTest;
      const tab = await browser.tabs.get(cmd.tabId);
      if (cmd.fn === 'readImage') await api.readImage!(tab, cmd.arg);
      else if (cmd.fn === 'startSelection') await api.startSelection!(cmd.tabId);
      else await api.scanVisible!(tab);
      return null;
    }
  }
}

export function mount() {
  const form = document.createElement('form');
  form.id = 'e2e';
  form.innerHTML = '<input id="e2e-cmd"><button id="e2e-run">run</button><output id="e2e-out"></output>';
  document.body.append(form);
  const input = form.querySelector('input')!;
  const out = form.querySelector('output')!;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { seq, ...cmd } = JSON.parse(input.value) as Command & { seq: number };
    let result: unknown;
    try {
      result = { ok: true, value: (await run(cmd as Command)) ?? null };
    } catch (err) {
      result = { ok: false, error: String(err) };
    }
    out.dataset.seq = String(seq);
    out.textContent = JSON.stringify(result);
  });
}
