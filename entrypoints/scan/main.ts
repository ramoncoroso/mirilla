// Página de escaneo (Fase 4 · 4.1): cámara y pantalla u otra ventana. Va en su propia pestaña, no en el popup:
// Firefox cierra el popup al salir el aviso de permisos y Chrome al abrir el selector de pantalla.
// Cámara y pantalla los pide el propio navegador en el momento (sin permisos en el manifest). Se lee fotograma a
// fotograma en local y nunca se graba ni se guarda ninguno; se para al leer un código o al ocultar la pestaña.

import { browser } from 'wxt/browser';
import { loadContextData, toAssessContext, withListed } from '@/lib/context';
import { decodeImageData, type Code } from '@/lib/decode';
import { t } from '@/lib/i18n';
import type { FromPopup } from '@/lib/messages';
import { domainAge } from '@/lib/rdap';
import { decodePdf, isPdf, MAX_PDF_PAGES, PdfTooLargeError } from '@/lib/pdf';
import { copyText, el, renderCodes, renderPdfPages, RESULT_CSS, THEME_CSS, THEME_DARK_CSS } from '@/lib/render';
import { analyzeUrl } from '@/lib/url-safety';
import type { MessageKey } from '@/locales/messages';

document.documentElement.lang = t('lang');
document.title = t('scanTitle');
for (const node of document.querySelectorAll<HTMLElement>('[data-i18n]')) node.textContent = t(node.dataset.i18n as MessageKey);

const style = document.createElement('style');
style.textContent = `:root { ${THEME_CSS} } @media (prefers-color-scheme: dark) { :root { ${THEME_DARK_CSS} } } ${RESULT_CSS}`;
document.head.append(style);

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const live = $('live');
const video = $<HTMLVideoElement>('video');
const cameraSelect = $<HTMLSelectElement>('camera-select');
const liveStatus = $('live-status');
const status = $('status');
const results = $('results');

/** ~8 fotogramas por segundo, y uno cada vez: si leer uno tarda más, se salta el siguiente. */
const FRAME_MS = 125;
/** Los fotogramas se reducen a este lado como mucho: más es más lento sin leer mejor. */
const MAX_SIDE = 1280;

let stream: MediaStream | null = null;
let source: 'camera' | 'screen' | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
let busy = false;
const canvas = document.createElement('canvas');
const ctx2d = canvas.getContext('2d', { willReadFrequently: true })!;

const actions = {
  openUrl(url: string) {
    if (analyzeUrl(url).openable) void browser.tabs.create({ url });
  },
  copy: (text: string) => copyText(text, { allowFallback: true }),
  investigate: domainAge,
};

/** Solo en la build E2E: Firefox no deja que geckodriver mire esta página, así que el estado se deja en storage. */
function report(state: string) {
  if (__E2E__) void browser.storage.local.set({ e2eScanState: state });
}

function setStatus(text: string | null) {
  status.hidden = !text;
  status.textContent = text ?? '';
}

function stop() {
  clearInterval(timer);
  timer = undefined;
  for (const track of stream?.getTracks() ?? []) track.stop();
  stream = null;
  source = null;
  video.srcObject = null;
  live.hidden = true;
  report('stopped');
}

async function play(kind: 'camera' | 'screen', s: MediaStream) {
  stream = s;
  source = kind;
  // Si el usuario deja de compartir desde el navegador (o desconecta la cámara), se para.
  for (const track of s.getVideoTracks()) track.addEventListener('ended', stop);
  video.srcObject = s;
  results.replaceChildren();
  setStatus(null);
  live.hidden = false;
  liveStatus.textContent = t(kind === 'camera' ? 'scanLookingCamera' : 'scanLookingScreen');
  await video.play().catch(() => {});
  timer = setInterval(() => void tick(), FRAME_MS);
  report(`live:${kind}`);
}

async function tick() {
  if (busy || !stream || video.readyState < 2 || !video.videoWidth) return;
  busy = true;
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    ctx2d.drawImage(video, 0, 0, canvas.width, canvas.height);
    const codes = await decodeImageData(ctx2d.getImageData(0, 0, canvas.width, canvas.height), { fast: true });
    if (codes.length > 0 && stream) {
      stop();
      await show(codes);
    }
  } catch (e) {
    console.error(e);
  } finally {
    busy = false;
  }
}

/** Resultados con el mismo análisis que el popup; el historial lo escribe el background (nunca en incógnito). */
async function show(codes: Code[]) {
  const base = await loadContextData().catch(() => undefined);
  const ctx = base && toAssessContext(await withListed(base, codes));
  results.replaceChildren(renderCodes(codes, actions, ctx));
  if (!browser.extension.inIncognitoContext) {
    await browser.runtime.sendMessage({ type: 'history-add', codes, pageUrl: '' } satisfies FromPopup).catch(() => {});
  }
}

/** Un PDF: todas sus páginas, en local; los resultados por página, los peligrosos primero. */
async function readPdf(file: File) {
  stop();
  results.replaceChildren();
  try {
    const result = await decodePdf(file, (page, total) => setStatus(t('pdfReading', page, total)));
    const codes = result.pages.flatMap((p) => p.codes);
    setStatus(codes.length === 0 ? t('pdfNoCodes') : null);
    if (result.truncated) results.append(el('p', 'status', t('pdfTruncated', MAX_PDF_PAGES, result.total)));
    if (codes.length === 0) return;
    const base = await loadContextData().catch(() => undefined);
    const ctx = base && toAssessContext(await withListed(base, codes));
    results.append(renderPdfPages(result.pages, actions, ctx));
    if (!browser.extension.inIncognitoContext) {
      await browser.runtime.sendMessage({ type: 'history-add', codes, pageUrl: '' } satisfies FromPopup).catch(() => {});
    }
  } catch (e) {
    console.error(e);
    setStatus(t(e instanceof PdfTooLargeError ? 'pdfTooLarge' : 'pdfError'));
  }
}

async function fillCameras(current?: string) {
  const cameras = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  cameraSelect.replaceChildren(
    ...cameras.map((c, i) => {
      const option = new Option(c.label || t('scanCameraN', i + 1), c.deviceId);
      option.selected = c.deviceId === current;
      return option;
    }),
  );
  cameraSelect.hidden = cameras.length < 2;
}

async function startCamera(deviceId?: string) {
  stop();
  try {
    const s = await navigator.mediaDevices.getUserMedia({
      video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' },
      audio: false,
    });
    await play('camera', s);
    await fillCameras(s.getVideoTracks()[0]?.getSettings().deviceId);
  } catch (e) {
    console.warn(e);
    setStatus(t('scanCameraError'));
    report(`error:${String(e)}`);
  }
}

async function startScreen() {
  stop();
  cameraSelect.hidden = true;
  try {
    await play('screen', await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }));
  } catch (e) {
    console.warn(e);
    setStatus(t('scanScreenCancelled'));
  }
}

$('camera').addEventListener('click', () => void startCamera());
$('screen').addEventListener('click', () => void startScreen());
$('stop').addEventListener('click', stop);
const pdfFile = $<HTMLInputElement>('pdf-file');
pdfFile.addEventListener('change', () => {
  if (pdfFile.files?.[0]) void readPdf(pdfFile.files[0]);
  pdfFile.value = '';
});
$('pdf').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    pdfFile.click();
  }
});
// Arrastrar un PDF a cualquier parte de la página.
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  document.body.classList.add('over');
});
document.addEventListener('dragleave', () => document.body.classList.remove('over'));
document.addEventListener('drop', (e) => {
  e.preventDefault();
  document.body.classList.remove('over');
  const file = Array.from(e.dataTransfer?.files ?? []).find((f) => isPdf(f));
  if (file) void readPdf(file);
});
cameraSelect.addEventListener('change', () => void startCamera(cameraSelect.value));
// La cámara no se queda encendida en una pestaña oculta. La pantalla sí (se suele compartir otra ventana).
document.addEventListener('visibilitychange', () => {
  if (document.hidden && source === 'camera') stop();
});
window.addEventListener('pagehide', stop);

// Desde el popup: ?mode=camera arranca la cámara; la pantalla necesita un clic aquí (el navegador lo exige).
const mode = new URLSearchParams(location.search).get('mode');
if (mode === 'camera') void startCamera();
else if (mode === 'screen') $('screen').focus();
else if (mode === 'pdf') $('pdf').focus();
