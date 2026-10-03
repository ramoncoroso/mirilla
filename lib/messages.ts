import type { ContextData } from './context';
import type { Code, Rect } from './decode';

/** Mensajes de la página (overlay) al background. `rect` va en píxeles CSS del viewport. */
export type ToBackground =
  | { type: 'region-selected'; rect: Rect; viewportWidth: number }
  | { type: 'open-url'; url: string }
  /** «Investigar más» desde el panel de la página: el background consulta RDAP y responde con un DomainAge. */
  | { type: 'rdap-lookup'; domain: string };

/** Mensajes del background a la página. */
export type ToContent =
  | { type: 'start-selection' }
  /** `ctx`: sitios de confianza y dominios ya vistos, cargados antes de guardar esta lectura en el historial. */
  | { type: 'show-results'; codes: Code[]; ctx?: ContextData; error?: string }
  | { type: 'show-busy' }
  /** Oculta la interfaz de Mirilla y responde cuando la página ya se ha repintado sin ella. */
  | { type: 'prepare-capture' }
  | { type: 'locate-image'; srcUrl: string };

/** Mensajes del popup al background. Solo se aceptan si vienen de una página de la extensión. */
export type FromPopup =
  | { type: 'start-selection'; tabId: number }
  | { type: 'history-add'; codes: Code[]; pageUrl: string }
  | { type: 'history-set-enabled'; enabled: boolean }
  | { type: 'history-clear' }
  /** Desde los ajustes, al activar la lista pública: descargarla ya. */
  | { type: 'blocklist-update' };
