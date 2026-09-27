import type { Code, Rect } from './decode';

/** Mensajes de la página (overlay) al background. `rect` va en píxeles CSS del viewport. */
export type ToBackground =
  | { type: 'region-selected'; rect: Rect; viewportWidth: number }
  | { type: 'open-url'; url: string };

/** Mensajes del background a la página. */
export type ToContent =
  | { type: 'start-selection' }
  | { type: 'show-results'; codes: Code[]; error?: string }
  | { type: 'show-busy' }
  | { type: 'locate-image'; srcUrl: string };

/** Mensajes del popup al background. */
export type FromPopup = { type: 'start-selection'; tabId: number };
