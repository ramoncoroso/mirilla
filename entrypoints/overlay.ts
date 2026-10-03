// Interfaz dentro de la página: selector de área y panel de resultados.
// Se inyecta bajo demanda con scripting.executeScript (solo activeTab, sin permisos de host)
// y vive en un shadow root cerrado para que la página no pueda leerla ni tocarla.
//
// La página es terreno hostil (auditoría del 2026-09-27): puede intentar ocultar el panel con CSS,
// cerrarlo con eventos falsos, quitarlo del DOM o secuestrar lo copiado. Por eso:
// - los estilos del host van con !important desde dentro del shadow DOM (ganan a los !important de la página),
//   y los colores se definen en elementos internos a los que la página no llega;
// - solo se atiende a teclas reales (isTrusted);
// - si la página quita el host mientras hay algo abierto, se vuelve a colgar;
// - copiar nunca usa execCommand (dispararía un evento `copy` que la página puede interceptar).

import { browser } from 'wxt/browser';
import { toAssessContext } from '@/lib/context';
import type { Rect } from '@/lib/decode';
import { t } from '@/lib/i18n';
import type { ToBackground, ToContent } from '@/lib/messages';
import { copyText, el, renderCodes, RESULT_CSS, THEME_CSS, THEME_DARK_CSS } from '@/lib/render';

declare global {
  interface Window {
    __mirilla?: { alive(): boolean; dispose(): void };
  }
}

export default defineUnlistedScript(() => {
  // Cada inyección vuelve a ejecutar el script. Si ya hay una instancia viva, no se hace nada; si es de una
  // versión anterior de la extensión (actualizada o recargada), ya no recibe mensajes: se retira y se sustituye.
  const previous = window.__mirilla;
  if (previous?.alive()) return;
  previous?.dispose();

  const host = document.createElement('mirilla-ui');
  for (const [prop, value] of Object.entries(HOST_STYLE)) host.style.setProperty(prop, value, 'important');
  // Cerrado para que la página no lea ni toque el panel. Solo la build E2E lo abre, para que los tests lo inspeccionen.
  const shadow = host.attachShadow({ mode: __E2E__ ? 'open' : 'closed' });
  const style = document.createElement('style');
  style.textContent = CSS;
  shadow.append(style);

  let panel: HTMLElement | null = null;
  let selecting = false;
  let endSelection: (() => void) | null = null;
  /** Elemento de la página que tenía el foco antes de mostrar resultados, para devolvérselo al cerrar. */
  let focusBefore: Element | null = null;

  function mount() {
    if (host.parentNode !== document.documentElement) document.documentElement.append(host);
  }

  function unmountIfIdle() {
    if (!panel && !selecting) host.remove();
  }

  // Si la página arranca o mueve el host mientras hay algo abierto, se vuelve a colgar.
  const observer = new MutationObserver(() => {
    if ((panel || selecting) && host.parentNode !== document.documentElement) mount();
  });
  observer.observe(document.documentElement, { childList: true });

  // ---- Panel de resultados ----

  function showPanel(content: Node, { focus = false } = {}) {
    mount();
    panel?.remove();
    panel = el('section', 'panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Mirilla');
    panel.tabIndex = -1;
    panel.lang = t('lang');
    const header = el('header', 'panel-head');
    const close = el('button', 'close', '×') as HTMLButtonElement;
    close.type = 'button';
    close.setAttribute('aria-label', t('close'));
    close.addEventListener('click', hidePanel);
    header.append(el('span', 'title', 'Mirilla'), close);
    const body = el('div', 'panel-body');
    // Los lectores de pantalla anuncian "Leyendo…" y los resultados cuando cambian.
    body.setAttribute('aria-live', 'polite');
    body.append(content);
    panel.append(header, body);
    shadow.append(panel);
    if (focus) {
      focusBefore ??= document.activeElement;
      panel.focus();
    }
  }

  function hidePanel() {
    const hadFocus = !!panel && shadow.activeElement !== null;
    panel?.remove();
    panel = null;
    unmountIfIdle();
    if (hadFocus && focusBefore instanceof HTMLElement) focusBefore.focus();
    focusBefore = null;
  }

  const actions = {
    openUrl: (url: string) => void browser.runtime.sendMessage({ type: 'open-url', url } satisfies ToBackground),
    copy: (text: string) => copyText(text),
  };

  // ---- Selección de área ----

  function startSelection() {
    if (selecting) return;
    hidePanel();
    selecting = true;
    mount();

    const layer = el('div', 'select-layer');
    const box = el('div', 'select-box');
    const hint = el('div', 'select-hint', t('selectHint'));
    layer.append(box, hint);
    shadow.append(layer);

    let start: { x: number; y: number } | null = null;
    let rect: Rect = { x: 0, y: 0, width: 0, height: 0 };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || !e.isTrusted) return;
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
    const onUp = async (e: PointerEvent) => {
      if (!start || !e.isTrusted) return;
      const selected = rect;
      end();
      if (selected.width < 8 || selected.height < 8) return;
      // Espera a que el navegador repinte sin la capa de selección antes de capturar.
      await repaint();
      void browser.runtime.sendMessage({
        type: 'region-selected',
        rect: selected,
        viewportWidth: window.innerWidth,
      } satisfies ToBackground);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !e.isTrusted) return;
      // Es nuestro Escape: que no lo reciban también los atajos de la página.
      e.preventDefault();
      e.stopPropagation();
      end();
    };
    function end() {
      layer.remove();
      window.removeEventListener('keydown', onKey, true);
      selecting = false;
      endSelection = null;
      start = null;
      unmountIfIdle();
    }
    endSelection = end;

    layer.addEventListener('pointerdown', onDown);
    layer.addEventListener('pointermove', onMove);
    layer.addEventListener('pointerup', onUp);
    // Un toque o un lápiz cancelado no debe dejar la capa de selección bloqueando la página.
    layer.addEventListener('pointercancel', end);
    layer.addEventListener('lostpointercapture', () => start && end());
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

  const onMessage = (msg: ToContent, _sender: unknown, sendResponse: (r: unknown) => void) => {
    switch (msg.type) {
      case 'start-selection':
        startSelection();
        break;
      case 'show-busy':
        showPanel(el('p', 'status', t('reading')));
        break;
      case 'show-results':
        if (msg.error) showPanel(el('p', 'status', msg.error), { focus: true });
        else if (msg.codes.length === 0) showPanel(el('p', 'status', t('noCodes')), { focus: true });
        else showPanel(renderCodes(msg.codes, actions, msg.ctx && toAssessContext(msg.ctx)), { focus: true });
        break;
      case 'locate-image':
        sendResponse(locateImage(msg.srcUrl));
        return true;
      case 'prepare-capture':
        hidePanel();
        void repaint().then(() => sendResponse(true));
        return true;
    }
    return undefined;
  };
  browser.runtime.onMessage.addListener(onMessage);

  const onEscape = (e: KeyboardEvent) => {
    // Un Escape fabricado por la página (dispatchEvent) no cierra el panel: solo el del usuario.
    if (e.key === 'Escape' && e.isTrusted && panel) hidePanel();
  };
  window.addEventListener('keydown', onEscape);

  window.__mirilla = {
    alive() {
      try {
        return !!browser.runtime?.id;
      } catch {
        return false;
      }
    },
    dispose() {
      observer.disconnect();
      endSelection?.();
      panel = null;
      host.remove();
      window.removeEventListener('keydown', onEscape);
      try {
        browser.runtime.onMessage.removeListener(onMessage);
      } catch {
        /* contexto de una extensión ya invalidada */
      }
    },
  };
});

/**
 * Espera a que la página se repinte (dos frames). requestAnimationFrame no avanza en pestañas ocultas,
 * así que se limita a 200 ms para no dejar la lectura colgada.
 */
function repaint() {
  const frames = new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  return Promise.race([frames, new Promise<void>((resolve) => setTimeout(resolve, 200))]);
}

/** Estilos del host, en línea y con !important. La regla :host de abajo los repite por si la página añade los suyos. */
const HOST_STYLE: Record<string, string> = {
  all: 'initial',
  display: 'block',
  position: 'fixed',
  inset: '0',
  'z-index': '2147483647',
  'pointer-events': 'none',
  visibility: 'visible',
  opacity: '1',
  transform: 'none',
  filter: 'none',
  'clip-path': 'none',
};

const CSS = `
/* Un !important declarado dentro del shadow DOM gana al !important de la página sobre el host. */
:host { ${Object.entries(HOST_STYLE)
  .map(([prop, value]) => `${prop}: ${value} !important;`)
  .join(' ')} }
/* Los colores van en elementos internos: una regla de la página sobre mirilla-ui no puede redefinirlos. */
.panel, .select-layer { ${THEME_CSS} }
@media (prefers-color-scheme: dark) { .panel, .select-layer { ${THEME_DARK_CSS} } }
* { box-sizing: border-box; }
.panel {
  pointer-events: auto; position: fixed; top: 12px; right: 12px; width: min(360px, calc(100vw - 24px));
  max-height: calc(100vh - 24px); display: flex; flex-direction: column;
  background: var(--qr-bg); color: var(--qr-fg); border: 1px solid var(--qr-border); border-radius: 12px;
  box-shadow: 0 8px 28px rgba(0,0,0,.25); font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
  text-transform: none; letter-spacing: normal; text-align: left; direction: ltr;
}
/* El panel recibe el foco para que el teclado y los lectores de pantalla lleguen a él; el indicador lo llevan los botones. */
.panel:focus, .panel:focus-visible { outline: none; }
.panel-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 8px 8px 14px; border-bottom: 1px solid var(--qr-border); }
.title { font-weight: 600; }
.close { font: 20px/1 system-ui; width: 28px; height: 28px; border: 0; border-radius: 6px; background: transparent; color: var(--qr-muted); cursor: pointer; }
.close:hover { background: var(--qr-badge); }
.close:focus-visible, .qr-btn:focus-visible { outline: 2px solid var(--qr-accent); outline-offset: 1px; }
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
