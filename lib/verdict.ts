// Veredicto único de cada código leído: ⛔ Peligro, ⚠️ Precaución, ℹ️ Sin señales de riesgo o ✅ Sitio de confianza.
// Mirilla analiza la dirección, no la página (no la visita), así que nunca dice «Seguro».
// - Peligro: hay pruebas (un truco evidente: esquema peligroso, marca suplantada, homógrafo...) o muchas señales a la vez.
// - Precaución: hay señales de riesgo.
// - Las señales leves suman (puntuación): plataforma compartida + palabras de phishing + dominio nuevo → Precaución.
// Lógica pura: el contexto (sitios de confianza, dominios ya vistos) lo carga quien llama (context.ts).

import type { MessageKey } from '@/locales/messages';
import type { Code } from './decode';
import { isUssd, premiumPrefix } from './data/phone';
import { parseGs1Date, type Gs1Element } from './gs1';
import { extractLinks } from './links';
import { ownerOf, references, type Reference } from './lookalike';
import { parseCode, type Parsed } from './parse';
import { hiddenChars } from './unicode';
import { analyzeUrl, type Finding, type UrlReport } from './url-safety';

export type Verdict = 'danger' | 'caution' | 'clear' | 'trusted';

export interface AssessContext {
  /** Sitios que se pueden imitar: los de confianza del usuario y las marcas. */
  refs: readonly Reference[];
  /** Dominios registrables que el usuario ha marcado como de confianza. */
  trusted: readonly string[];
  /** Dominios ya leídos antes con Mirilla, o null si el historial está desactivado. */
  known: ReadonlySet<string> | null;
  /** El usuario desactivó el historial: la señal de familiaridad no está disponible (se explica en una nota). */
  historyOff?: boolean;
}

export interface LinkCheck {
  report: UrlReport;
  verdict: Verdict;
  /** Hallazgos del enlace, incluidos los del contexto (sitio de confianza, primera vez...). */
  findings: Finding[];
}

export interface Assessment {
  verdict: Verdict;
  /** Hallazgos del contenido (no los de sus enlaces). */
  findings: Finding[];
  /** El enlace, si el código es una URL. */
  link?: LinkCheck;
  /** Enlaces escondidos dentro del contenido (texto, SMS, email, web de un contacto...). */
  embedded: LinkCheck[];
}

export const DEFAULT_CONTEXT: AssessContext = { refs: references(), trusted: [], known: null };

/**
 * Lo que suma cada hallazgo en la puntuación. Por defecto, un aviso (warn) suma 2 y una nota (info) 0;
 * las notas que sí son señales de riesgo suman 1. Los avisos que no tienen que ver con la seguridad
 * (un producto caducado, un dato GS1 mal formado) no suman.
 */
const WEIGHTS: Partial<Record<MessageKey, number>> = {
  urlSharedHosting: 1,
  urlPort: 1,
  urlPhishingWords: 1,
  urlIdn: 1,
  urlBrandTld: 1,
  urlFirstVisit: 1,
  gs1Expired: 0,
  gs1Malformed: 0,
};
const CAUTION_SCORE = 2;
const DANGER_SCORE = 5;

const ORDER: Verdict[] = ['clear', 'trusted', 'caution', 'danger'];

export function worst(...verdicts: Verdict[]): Verdict {
  return verdicts.reduce((a, b) => (ORDER.indexOf(b) > ORDER.indexOf(a) ? b : a), 'clear');
}

export function score(findings: readonly Finding[]): number {
  return findings.reduce((sum, f) => sum + (f.level === 'danger' ? DANGER_SCORE : (WEIGHTS[f.message] ?? (f.level === 'warn' ? 2 : 0))), 0);
}

function verdictOf(findings: readonly Finding[]): Verdict {
  if (findings.some((f) => f.level === 'danger')) return 'danger';
  const s = score(findings);
  return s >= DANGER_SCORE ? 'danger' : s >= CAUTION_SCORE ? 'caution' : 'clear';
}

/** Analiza un enlace con el contexto del usuario. */
export function assessUrl(raw: string, ctx: AssessContext = DEFAULT_CONTEXT): LinkCheck {
  const report = analyzeUrl(raw, ctx.refs);
  const findings = [...report.findings];
  const web = report.openable && !!report.domain;
  const trusted = web && ctx.trusted.includes(report.domain);

  // Familiaridad: el fraude casi siempre llega desde un dominio nuevo para la víctima. Las marcas conocidas no cuentan.
  if (web && !trusted && ctx.known && !ctx.known.has(report.domain) && !ownerOf(report.domain, ctx.refs)) {
    findings.push({ level: 'info', message: 'urlFirstVisit' });
  }
  if (web && !trusted && ctx.historyOff) findings.push({ level: 'info', message: 'urlFamiliarityOff' });

  let verdict = verdictOf(findings);
  // Las señales que suman por sí solas llegan a Peligro: se explica por qué.
  if (verdict === 'danger' && !findings.some((f) => f.level === 'danger')) findings.unshift({ level: 'danger', message: 'urlCombined' });
  if (trusted && verdict === 'clear') {
    verdict = 'trusted';
    findings.unshift({ level: 'info', message: 'verdictTrustedDetail', args: [report.domain] });
  }
  return { report, verdict, findings };
}

/** Veredicto de un código leído: el peor entre su contenido, su enlace y los enlaces que lleva dentro. */
export function assess(code: Code, ctx: AssessContext = DEFAULT_CONTEXT, parsed: Parsed = parseCode(code)): Assessment {
  const findings: Finding[] = [];
  const embedded: string[] = [];
  let link: LinkCheck | undefined;

  // Invisibles y controles bidi hacen que el texto se vea distinto de lo que es, en cualquier tipo de contenido.
  const hidden = hiddenChars(code.text);
  if (hidden.length > 0) findings.push({ level: 'danger', message: 'hiddenChars', args: [hidden.join(', ')] });

  switch (parsed.kind) {
    case 'url':
      link = assessUrl(parsed.url, ctx);
      if (parsed.gs1) findings.push(...gs1Findings(parsed.gs1));
      break;
    case 'tel':
      findings.push(...phoneFindings(parsed.number));
      break;
    case 'sms':
      findings.push(...phoneFindings(parsed.number));
      embedded.push(...extractLinks(parsed.body));
      break;
    case 'email':
      embedded.push(...extractLinks(`${parsed.subject}\n${parsed.body}`));
      break;
    case 'wifi':
      if (parsed.security === 'nopass') findings.push({ level: 'warn', message: 'wifiOpen' });
      else if (/^wep$/i.test(parsed.security)) findings.push({ level: 'warn', message: 'wifiWep' });
      break;
    case 'contact':
      for (const f of parsed.fields) {
        if (f.label === 'fieldPhone') findings.push(...phoneFindings(f.value));
        else if (f.label === 'fieldWeb') embedded.push(...extractLinks(/^https?:\/\//i.test(f.value) ? f.value : `https://${f.value}`));
        else embedded.push(...extractLinks(f.value));
      }
      break;
    case 'sepa':
      if (!parsed.ibanValid) findings.push({ level: 'danger', message: 'ibanInvalid' });
      embedded.push(...extractLinks(`${parsed.name}\n${parsed.reference}`));
      break;
    case 'gs1':
      findings.push(...gs1Findings(parsed.elements));
      if (parsed.rest) findings.push({ level: 'info', message: 'gs1Unparsed', args: [parsed.rest] });
      break;
    case 'text':
      embedded.push(...extractLinks(parsed.text));
      break;
    case 'geo':
      embedded.push(...extractLinks(parsed.query));
      break;
    case 'product':
      break;
  }

  // Un mismo enlace solo se analiza una vez; el principal no se repite como escondido.
  const links = [...new Set(embedded)].filter((u) => u !== link?.report.href).map((u) => assessUrl(u, ctx));
  const verdict = worst(verdictOf(findings), ...(link ? [link.verdict] : []), ...links.map((l) => l.verdict));
  return { verdict, findings, ...(link && { link }), embedded: links };
}

function phoneFindings(number: string): Finding[] {
  if (isUssd(number)) return [{ level: 'danger', message: 'telUssd' }];
  const prefix = premiumPrefix(number);
  return prefix ? [{ level: 'warn', message: 'telPremium', args: [prefix] }] : [];
}

/** Avisos de datos GS1: dígito de control (Peligro: el código no es el que dice ser), longitud y caducidad. */
function gs1Findings(elements: readonly Gs1Element[]): Finding[] {
  const findings: Finding[] = [];
  for (const e of elements) {
    if (e.malformed) findings.push({ level: 'warn', message: 'gs1Malformed', args: [`(${e.ai})`, e.malformed.expected, String(e.malformed.actual)] });
    if (e.checkDigitOk === false) findings.push({ level: 'danger', message: 'gs1BadCheckDigit', args: [`(${e.ai})`, e.expectedCheckDigit ?? ''] });
    if (e.ai === '17') {
      const d = parseGs1Date(e.value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (d && d.date < today) findings.push({ level: 'warn', message: 'gs1Expired' });
    }
  }
  return findings;
}
