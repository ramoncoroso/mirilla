// Interfaz dentro de la página: selector de área y panel de resultados.
// Se inyecta bajo demanda con scripting.executeScript (solo activeTab, sin permisos de host)
// y vive en un shadow root cerrado para que ni la página ni su CSS la toquen.

import { browser } from 'wxt/browser';
import type { Rect } from '@/lib/decode';
import type { ToBackground, ToContent } from '@/lib/messages';
import { copyText, el, renderCodes, RESULT_CSS, THEME_CSS, THEME_DARK_CSS } from '@/lib/render';

declare global {
  interface Window {
    __mirilla?: boolean;
  }
}

export default defineUnlistedScript(() => {
  // Cada inyección vuelve a ejecutar el script: solo se inicializa la primera vez.
  if (window.__mirilla) return;
  window.__mirilla = true;

  const host = document.createElement('mirilla-ui');
  host.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = CSS;
  shadow.append(style);

  let panel: HTMLElement | null = null;
  let selecting = false;

  function mount() {
    if (!host.isConnected) document.documentElement.append(host);
  }

  function unmountIfIdle() {
    if (!panel && !selecting) host.remove();
  }

  // ---- Panel de resultados ----

  function showPanel(content: Node) {
    mount();
    panel?.remove();
    panel = el('section', 'panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Mirilla');
    const header = el('header', 'panel-head');
    const close = el('button', 'close', '×') as HTMLButtonElement;
    close.type = 'button';
    close.setAttribute('aria-label', 'Cerrar');
    close.addEventListener('click', hidePanel);
    header.append(el('span', 'title', 'Mirilla'), close);
    const body = el('div', 'panel-body');
    body.append(content);
    panel.append(header, body);
    shadow.append(panel);
  }

  function hidePanel() {
    panel?.remove();
    panel = null;
    unmountIfIdle();
  }

  const actions = {
    openUrl: (url: string) => void browser.runtime.sendMessage({ type: 'open-url', url } satisfies ToBackground),
    copy: (text: string) => copyText(text, shadow),
  };

  // ---- Selección de área ----

  function startSelection() {
    if (selecting) return;
    hidePanel();
    selecting = true;
    mount();

    const layer = el('div', 'select-layer');
    const box = el('div', 'select-box');
    const hint = el('div', 'select-hint', 'Arrastra para seleccionar el código · Esc para cancelar');
    layer.append(box, hint);
    shadow.append(layer);

    let start: { x: number; y: number } | null = null;
    let rect: Rect = { x: 0, y: 0, width: 0, height: 0 };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      start = { x: e.clientX, y: e.clientY };
      layer.setPointerCapture(e.pointerId);
      hint.remove();
      // A partir de aquí oscurece la sombra del recuadro, no la capa entera.
      layer.style.background = 'transparent';
    };
    const onMove = (e: PointerEvent) => {
      if (!start) return;
      rect = {
        x: Math.min(start.x, e.clientX),
        y: Math.min(start.y, e.clientY),
        width: Math.abs(e.clientX - start.x),
        height: Math.abs(e.clientY - start.y),
      };
      Object.assign(box.style, {
        display: 'block',
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
    };
    const onUp = async () => {
      if (!start) return;
      const selected = rect;
      end();
      if (selected.width < 8 || selected.height < 8) return;
      // Espera a que el navegador repinte sin la capa de selección antes de capturar.
      await nextFrame();
      await nextFrame();
      void browser.runtime.sendMessage({
        type: 'region-selected',
        rect: selected,
        viewportWidth: window.innerWidth,
      } satisfies ToBackground);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') end();
    };
    function end() {
      layer.remove();
      window.removeEventListener('keydown', onKey, true);
      selecting = false;
      start = null;
      unmountIfIdle();
    }

    layer.addEventListener('pointerdown', onDown);
    layer.addEventListener('pointermove', onMove);
    layer.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey, true);
  }

  // ---- Localizar una imagen para recortarla de la captura ----

  function locateImage(srcUrl: string): { rect: Rect; viewportWidth: number } | null {
    const imgs = Array.from(document.querySelectorAll('img, input[type=image]')) as (HTMLImageElement | HTMLInputElement)[];
    for (const img of imgs) {
      const src = img instanceof HTMLImageElement ? img.currentSrc || img.src : img.src;
      if (src !== srcUrl) continue;
      const r = img.getBoundingClientRect();
      const x = Math.max(0, r.left);
      const y = Math.max(0, r.top);
      const right = Math.min(window.innerWidth, r.right);
      const bottom = Math.min(window.innerHeight, r.bottom);
      if (right - x < 4 || bottom - y < 4) continue;
      return { rect: { x, y, width: right - x, height: bottom - y }, viewportWidth: window.innerWidth };
    }
    return null;
  }

  // ---- Mensajes del background ----

  browser.runtime.onMessage.addListener((msg: ToContent, _sender, sendResponse) => {
    switch (msg.type) {
      case 'start-selection':
        startSelection();
        break;
      case 'show-busy':
        showPanel(el('p', 'status', 'Leyendo…'));
        break;
      case 'show-results':
        if (msg.error) showPanel(el('p', 'status', msg.error));
        else if (msg.codes.length === 0)
          showPanel(el('p', 'status', 'No se ha encontrado ningún código. Prueba a seleccionar un área más ajustada al código.'));
        else showPanel(renderCodes(msg.codes, actions));
        break;
      case 'locate-image':
        sendResponse(locateImage(msg.srcUrl));
        return true;
    }
    return undefined;
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel) hidePanel();
  });
});

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

const CSS = `
:host { ${THEME_CSS} }
@media (prefers-color-scheme: dark) { :host { ${THEME_DARK_CSS} } }
* { box-sizing: border-box; }
.panel {
  pointer-events: auto; position: fixed; top: 12px; right: 12px; width: min(360px, calc(100vw - 24px));
  max-height: calc(100vh - 24px); display: flex; flex-direction: column;
  background: var(--qr-bg); color: var(--qr-fg); border: 1px solid var(--qr-border); border-radius: 12px;
  box-shadow: 0 8px 28px rgba(0,0,0,.25); font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
}
.panel-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 8px 8px 14px; border-bottom: 1px solid var(--qr-border); }
.title { font-weight: 600; }
.close { font: 20px/1 system-ui; width: 28px; height: 28px; border: 0; border-radius: 6px; background: transparent; color: var(--qr-muted); cursor: pointer; }
.close:hover { background: var(--qr-badge); }
.panel-body { padding: 12px; overflow: auto; }
.status { margin: 0; color: var(--qr-muted); }
.select-layer { pointer-events: auto; position: fixed; inset: 0; cursor: crosshair; background: rgba(0,0,0,.25); }
.select-box { display: none; position: fixed; border: 2px solid #4c8df6; background: rgba(76,141,246,.12); box-shadow: 0 0 0 99999px rgba(0,0,0,.2); }
.select-hint {
  position: fixed; top: 16px; left: 50%; transform: translateX(-50%); padding: 8px 14px; border-radius: 8px;
  background: rgba(32,33,36,.92); color: #fff; font: 13px/1.3 system-ui, sans-serif; pointer-events: none;
}
${RESULT_CSS}
`;
