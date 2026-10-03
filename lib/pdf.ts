// PDF (Fase 4 · 4.1): el vector número uno del quishing es un PDF adjunto con un QR dentro, que los filtros de correo
// no suelen leer y en cuyo visor no se puede inyectar. Se abre en local con pdf.js (incluido en el paquete, sin código
// remoto ni eval) y se buscan códigos en cada página.

import { browser } from 'wxt/browser';
import { decodeImageData, type Code } from './decode';

/** Límites: un PDF enorme no debe colgar la pestaña. */
export const MAX_PDF_BYTES = 50 * 1024 * 1024;
export const MAX_PDF_PAGES = 50;
/** Lado largo de cada página al dibujarla: suficiente para un QR pequeño en un A4 sin disparar la memoria. */
const RENDER_SIDE = 2400;

export interface PdfPage {
  page: number;
  codes: Code[];
}

export interface PdfResult {
  pages: PdfPage[];
  /** Páginas del documento (puede haber más que las analizadas). */
  total: number;
  /** Se han analizado solo las MAX_PDF_PAGES primeras. */
  truncated: boolean;
}

export class PdfTooLargeError extends Error {}

const getURL = browser.runtime.getURL as (path: string) => string;

export function isPdf(file: Blob & { name?: string }): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name ?? '');
}

/** Lee los códigos de todas las páginas (hasta MAX_PDF_PAGES). `onPage` informa del progreso. */
export async function decodePdf(file: Blob, onPage?: (page: number, total: number) => void): Promise<PdfResult> {
  if (file.size > MAX_PDF_BYTES) throw new PdfTooLargeError();
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = getURL('/pdfjs/pdf.worker.min.mjs');
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    // pdf.js 6 no usa eval (la CSP de la extensión lo prohíbe). Sin fuentes: para encontrar códigos no hace falta texto.
    disableFontFace: true,
    useSystemFonts: false,
    // Decodificadores de imágenes JPEG 2000 y JBIG2, incluidos en el paquete.
    wasmUrl: getURL('/pdfjs/wasm/'),
    // Nada de la red: ni fuentes estándar ni mapas de caracteres remotos.
    stopAtErrors: false,
  });
  const doc = await task.promise;
  try {
    const total = doc.numPages;
    const count = Math.min(total, MAX_PDF_PAGES);
    const pages: PdfPage[] = [];
    for (let n = 1; n <= count; n++) {
      onPage?.(n, count);
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(4, RENDER_SIDE / Math.max(base.width, base.height)) });
      const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      // Fondo blanco: un PDF sin fondo se dibuja transparente y el QR negro sobre transparente no se lee.
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise;
      const codes = await decodeImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (codes.length > 0) pages.push({ page: n, codes });
      page.cleanup();
    }
    return { pages, total, truncated: total > count };
  } finally {
    await task.destroy();
  }
}
