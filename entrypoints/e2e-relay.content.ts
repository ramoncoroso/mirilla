// Solo en la build E2E de Firefox (wxt.config.ts lo quita de las demás): pasa al background las órdenes que el test
// manda desde la página de pruebas con postMessage, y le devuelve el resultado. Ver lib/e2e-bridge.ts.

import { browser } from 'wxt/browser';

export default defineContentScript({
  matches: ['http://127.0.0.1/*'],
  include: ['firefox'],
  main() {
    window.addEventListener('message', async (e: MessageEvent) => {
      const msg = e.data?.mirillaE2E as { seq: number; cmd: unknown } | undefined;
      if (e.source !== window || !msg) return;
      const result = await browser.runtime.sendMessage({ type: 'e2e', cmd: msg.cmd }).catch((err: unknown) => ({ ok: false, error: String(err) }));
      window.postMessage({ mirillaE2EResult: { seq: msg.seq, result } }, '*');
    });
    document.documentElement.dataset.mirillaE2e = 'ready';
  },
});
