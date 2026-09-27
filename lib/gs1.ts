// Interpretación de datos GS1: identificadores de aplicación (AI), GS1 Digital Link,
// dígito de control de GTIN/GLN/SSCC y prefijo GS1 de los códigos EAN/UPC.
// Referencia: GS1 General Specifications (secciones 3 y 7.8) y GS1 Digital Link Standard.
// Sin dependencias del navegador: la traducción y el formato de fechas/números los hace render.ts.

import type { MessageKey } from '@/locales/messages';

export const GS = '\u001d';

export type AiKind = 'text' | 'gtin' | 'gln' | 'sscc' | 'date' | 'measure' | 'count' | 'amount' | 'amountIso' | 'country';

export interface AiDef {
  /** Título oficial GS1 (se muestra si no hay traducción). */
  title: string;
  label?: MessageKey;
  kind: AiKind;
  /** Longitud exacta del valor, si es fija. */
  length?: number;
  /** Longitud máxima del valor, si es variable. */
  max?: number;
  unit?: string;
  /** Los primeros N dígitos terminan en un dígito de control (GTIN 14, GLN 13, SSCC 18...). */
  check?: number;
}

export interface Gs1Element {
  ai: string;
  value: string;
  def?: AiDef;
  /** Decimales implícitos (último dígito del AI en 310n, 392n...). */
  decimals?: number;
  /** false si el dígito de control es incorrecto; undefined si no aplica. */
  checkDigitOk?: boolean;
  /** Dígito de control correcto, cuando el leído no lo es. */
  expectedCheckDigit?: string;
  /** La longitud no es la de la especificación: el dato puede estar mal leído (p. ej. falta un separador GS). */
  malformed?: { expected: string; actual: number };
}

export interface Gs1Result {
  elements: Gs1Element[];
  /** Resto que no se pudo interpretar (AI desconocido o datos mal formados). */
  rest?: string;
}

// ---- Tabla de AIs (los de uso habitual; la lista completa tiene cientos) ----

const T = (title: string, kind: AiKind, extra: Partial<AiDef> = {}): AiDef => ({ title, kind, ...extra });

const AIS: Record<string, AiDef> = {
  '00': T('SSCC', 'sscc', { length: 18, check: 18, label: 'gs1Sscc' }),
  '01': T('GTIN', 'gtin', { length: 14, check: 14, label: 'gs1Gtin' }),
  '02': T('CONTENT', 'gtin', { length: 14, check: 14, label: 'gs1Content' }),
  '10': T('BATCH/LOT', 'text', { max: 20, label: 'gs1Batch' }),
  '11': T('PROD DATE', 'date', { length: 6, label: 'gs1ProdDate' }),
  '12': T('DUE DATE', 'date', { length: 6, label: 'gs1DueDate' }),
  '13': T('PACK DATE', 'date', { length: 6, label: 'gs1PackDate' }),
  '15': T('BEST BEFORE or BEST BY', 'date', { length: 6, label: 'gs1BestBefore' }),
  '16': T('SELL BY', 'date', { length: 6, label: 'gs1SellBy' }),
  '17': T('USE BY or EXPIRY', 'date', { length: 6, label: 'gs1Expiry' }),
  '20': T('VARIANT', 'text', { length: 2, label: 'gs1Variant' }),
  '21': T('SERIAL', 'text', { max: 20, label: 'gs1Serial' }),
  '22': T('CPV', 'text', { max: 20, label: 'gs1Cpv' }),
  '235': T('TPX', 'text', { max: 28 }),
  '240': T('ADDITIONAL ID', 'text', { max: 30 }),
  '241': T('CUST. PART No.', 'text', { max: 30, label: 'gs1CustomerPart' }),
  '242': T('MTO VARIANT', 'text', { max: 6 }),
  '243': T('PCN', 'text', { max: 20 }),
  '250': T('SECONDARY SERIAL', 'text', { max: 30 }),
  '251': T('REF. TO SOURCE', 'text', { max: 30 }),
  '253': T('GDTI', 'text', { max: 30, check: 13 }),
  '254': T('GLN EXTENSION COMPONENT', 'text', { max: 20 }),
  '255': T('GCN', 'text', { max: 25, check: 13 }),
  '30': T('VAR. COUNT', 'count', { max: 8, label: 'gs1Count' }),
  '37': T('COUNT', 'count', { max: 8, label: 'gs1Count' }),
  // Medidas: el cuarto dígito del AI son los decimales (3103 = kg con 3 decimales).
  '310': T('NET WEIGHT (kg)', 'measure', { length: 6, unit: 'kg', label: 'gs1NetWeight' }),
  '311': T('LENGTH (m)', 'measure', { length: 6, unit: 'm', label: 'gs1Length' }),
  '312': T('WIDTH (m)', 'measure', { length: 6, unit: 'm', label: 'gs1Width' }),
  '313': T('HEIGHT (m)', 'measure', { length: 6, unit: 'm', label: 'gs1Height' }),
  '314': T('AREA (m²)', 'measure', { length: 6, unit: 'm²', label: 'gs1Area' }),
  '315': T('NET VOLUME (l)', 'measure', { length: 6, unit: 'l', label: 'gs1NetVolume' }),
  '316': T('NET VOLUME (m³)', 'measure', { length: 6, unit: 'm³', label: 'gs1NetVolume' }),
  '320': T('NET WEIGHT (lb)', 'measure', { length: 6, unit: 'lb', label: 'gs1NetWeight' }),
  '330': T('GROSS WEIGHT (kg)', 'measure', { length: 6, unit: 'kg', label: 'gs1GrossWeight' }),
  '331': T('LENGTH (m), log', 'measure', { length: 6, unit: 'm', label: 'gs1Length' }),
  '332': T('WIDTH (m), log', 'measure', { length: 6, unit: 'm', label: 'gs1Width' }),
  '333': T('HEIGHT (m), log', 'measure', { length: 6, unit: 'm', label: 'gs1Height' }),
  '334': T('AREA (m²), log', 'measure', { length: 6, unit: 'm²', label: 'gs1Area' }),
  '335': T('VOLUME (l), log', 'measure', { length: 6, unit: 'l', label: 'gs1GrossVolume' }),
  '336': T('VOLUME (m³), log', 'measure', { length: 6, unit: 'm³', label: 'gs1GrossVolume' }),
  '390': T('AMOUNT', 'amount', { max: 15, label: 'gs1Amount' }),
  '391': T('AMOUNT', 'amountIso', { max: 18, label: 'gs1Amount' }),
  '392': T('PRICE', 'amount', { max: 15, label: 'gs1Price' }),
  '393': T('PRICE', 'amountIso', { max: 18, label: 'gs1Price' }),
  '400': T('ORDER NUMBER', 'text', { max: 30, label: 'gs1Order' }),
  '401': T('GINC', 'text', { max: 30, label: 'gs1Consignment' }),
  '402': T('GSIN', 'text', { length: 17, check: 17, label: 'gs1Shipment' }),
  '403': T('ROUTE', 'text', { max: 30 }),
  '410': T('SHIP TO LOC', 'gln', { length: 13, check: 13, label: 'gs1ShipTo' }),
  '411': T('BILL TO', 'gln', { length: 13, check: 13, label: 'gs1BillTo' }),
  '412': T('PURCHASE FROM', 'gln', { length: 13, check: 13, label: 'gs1PurchaseFrom' }),
  '413': T('SHIP FOR LOC', 'gln', { length: 13, check: 13, label: 'gs1ShipFor' }),
  '414': T('LOC No.', 'gln', { length: 13, check: 13, label: 'gs1Location' }),
  '415': T('PAY TO', 'gln', { length: 13, check: 13, label: 'gs1PayTo' }),
  '416': T('PROD/SERV LOC', 'gln', { length: 13, check: 13, label: 'gs1Location' }),
  '417': T('PARTY', 'gln', { length: 13, check: 13, label: 'gs1Party' }),
  '420': T('SHIP TO POST', 'text', { max: 20, label: 'gs1ShipToPost' }),
  '422': T('ORIGIN', 'country', { length: 3, label: 'gs1Origin' }),
  '424': T('COUNTRY - PROCESS', 'country', { length: 3, label: 'gs1ProcessCountry' }),
  '426': T('COUNTRY - FULL PROCESS', 'country', { length: 3, label: 'gs1ProcessCountry' }),
  '7003': T('EXPIRY TIME', 'text', { length: 10 }),
  '7006': T('FIRST FREEZE DATE', 'date', { length: 6 }),
  '8003': T('GRAI', 'text', { max: 30, check: 14 }),
  '8004': T('GIAI', 'text', { max: 30 }),
  '8006': T('ITIP', 'text', { length: 18, check: 14 }),
  '8008': T('PROD TIME', 'text', { max: 12 }),
  '8010': T('CPID', 'text', { max: 30 }),
  '8011': T('CPID SERIAL', 'text', { max: 12 }),
  '8012': T('VERSION', 'text', { max: 20 }),
  '8013': T('GMN', 'text', { max: 25 }),
  '8017': T('GSRN - PROVIDER', 'text', { length: 18, check: 18 }),
  '8018': T('GSRN - RECIPIENT', 'text', { length: 18, check: 18 }),
  '8020': T('REF No.', 'text', { max: 25 }),
  '8200': T('PRODUCT URL', 'text', { max: 70 }),
  '90': T('INTERNAL', 'text', { max: 30, label: 'gs1Internal' }),
};
for (let i = 91; i <= 99; i++) AIS[String(i)] = T('INTERNAL', 'text', { max: 90, label: 'gs1Internal' });

/** Familias de AI de 4 dígitos cuyo último dígito indica decimales. */
const DECIMAL_FAMILIES = new Set(['310', '311', '312', '313', '314', '315', '316', '320', '330', '331', '332', '333', '334', '335', '336', '390', '391', '392', '393']);

/**
 * Prefijos de AI con longitud predefinida: no llevan separador GS aunque vayan en medio
 * (GS1 General Specifications, figura 7.8.5-2). Valor = longitud del valor sin el AI.
 */
function predefinedLength(ai: string): number | undefined {
  const p = ai.slice(0, 2);
  if (p === '00') return 18;
  if (p === '01' || p === '02' || p === '03') return 14;
  if (p === '04') return 16;
  if (['11', '12', '13', '14', '15', '16', '17', '18', '19'].includes(p)) return 6;
  if (p === '20') return 2;
  if (['31', '32', '33', '34', '35', '36'].includes(p)) return 6;
  if (p === '41') return 13;
  return undefined;
}

/** Identifica el AI al principio de `s` y devuelve su código y definición. */
function matchAi(s: string): { ai: string; def: AiDef; decimals?: number } | null {
  for (const len of [2, 3, 4]) {
    const ai = s.slice(0, len);
    if (!/^\d+$/.test(ai) || ai.length < len) return null;
    // 310n, 392n...: AI de 4 dígitos cuyo último dígito son los decimales.
    if (len === 3 && DECIMAL_FAMILIES.has(ai)) {
      const full = s.slice(0, 4);
      if (!/^\d{4}$/.test(full) || !validDecimals(full)) return null;
      return { ai: full, def: AIS[ai]!, decimals: Number(full[3]) };
    }
    const def = AIS[ai];
    if (def) return { ai, def };
  }
  return null;
}

/** Interpreta una cadena GS1 en bruto (AIs seguidos, separados por GS tras los campos variables). */
export function parseGs1(raw: string): Gs1Result {
  // zxing puede devolver el identificador de simbología o un GS inicial (FNC1 en primera posición).
  let s = raw.replace(/^\][A-Za-z]\d/, '').replace(/^\u001d+/, '');
  const elements: Gs1Element[] = [];
  while (s.length > 0) {
    const m = matchAi(s);
    if (!m) return { elements, rest: s.replaceAll(GS, '') };
    s = s.slice(m.ai.length);
    let value: string;
    const fixed = predefinedLength(m.ai);
    if (fixed !== undefined) {
      value = s.slice(0, fixed);
      s = s.slice(fixed);
      if (s.startsWith(GS)) s = s.slice(1);
    } else {
      const end = s.indexOf(GS);
      value = end < 0 ? s : s.slice(0, end);
      s = end < 0 ? '' : s.slice(end + 1);
    }
    elements.push(withChecks({ ai: m.ai, value, def: m.def, decimals: m.decimals }));
  }
  return { elements };
}

/** Texto legible "(01)08412345678905(10)LOTE". */
export function toHri(elements: Gs1Element[], rest?: string): string {
  return elements.map((e) => `(${e.ai})${e.value}`).join('') + (rest ?? '');
}

/** En 31nn–36nn (medidas) los decimales van de 0 a 5; en 39nn (importes), de 0 a 9. */
function validDecimals(ai: string): boolean {
  return ai.startsWith('39') || Number(ai[3]) <= 5;
}

function withChecks(e: Gs1Element): Gs1Element {
  const def = e.def;
  if (!def) return e;
  // Una longitud que no cuadra suele ser un dato mal partido (falta un GS): el dígito de control no significaría nada.
  if (def.length !== undefined && e.value.length !== def.length) return { ...e, malformed: { expected: String(def.length), actual: e.value.length } };
  if (def.max !== undefined && e.value.length > def.max) return { ...e, malformed: { expected: `≤ ${def.max}`, actual: e.value.length } };
  if (def.check !== undefined) {
    const digits = e.value.slice(0, def.check);
    if (digits.length === def.check && /^\d+$/.test(digits)) {
      const expected = checkDigit(digits.slice(0, -1));
      return expected === digits.slice(-1) ? { ...e, checkDigitOk: true } : { ...e, checkDigitOk: false, expectedCheckDigit: expected };
    }
  }
  return e;
}

// ---- Dígito de control (módulo 10, pesos 3-1 desde la derecha) ----

export function checkDigit(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const digit = Number(body[body.length - 1 - i]);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return String((10 - (sum % 10)) % 10);
}

export function isValidGtin(gtin: string): boolean {
  return /^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(gtin) && checkDigit(gtin.slice(0, -1)) === gtin.slice(-1);
}

// ---- Fechas YYMMDD ----

/**
 * Convierte YYMMDD a fecha. El siglo sigue la ventana deslizante de GS1 (General Specifications 7.12):
 * el año se interpreta dentro de [año actual − 49, año actual + 50]. DD = 00 significa fin de mes.
 */
export function parseGs1Date(v: string, now = new Date()): { date: Date; endOfMonth: boolean } | null {
  if (!/^\d{6}$/.test(v)) return null;
  const yy = Number(v.slice(0, 2));
  const mm = Number(v.slice(2, 4));
  const dd = Number(v.slice(4, 6));
  if (mm < 1 || mm > 12 || dd > 31) return null;
  const current = now.getFullYear();
  const century = Math.floor(current / 100) * 100;
  let year = century + yy;
  if (year - current >= 51) year -= 100;
  else if (year - current <= -50) year += 100;
  const endOfMonth = dd === 0;
  // Día 0 del mes siguiente = último día del mes.
  const date = endOfMonth ? new Date(year, mm, 0) : new Date(year, mm - 1, dd);
  if (!endOfMonth && date.getDate() !== dd) return null;
  return { date, endOfMonth };
}

// ---- GS1 Digital Link ----

const DL_PRIMARY = new Set(['01', '00', '253', '255', '401', '402', '414', '417', '8003', '8004', '8006', '8010', '8013', '8017', '8018']);

/** Sintaxis de cada clave principal de Digital Link (GS1 General Specifications, sección 3). */
const CSET82 = "[!\"%&'()*+,\\-./0-9:;<=>?A-Z_a-z]";
const DL_PRIMARY_SYNTAX: Record<string, RegExp> = {
  '01': /^(\d{8}|\d{12,14})$/,
  '00': /^\d{18}$/,
  '253': new RegExp(`^\\d{13}${CSET82}{0,17}$`),
  '255': /^\d{13,25}$/,
  '401': new RegExp(`^\\d{4}${CSET82}{0,26}$`),
  '402': /^\d{17}$/,
  '414': /^\d{13}$/,
  '417': /^\d{13}$/,
  '8003': new RegExp(`^\\d{14}${CSET82}{0,16}$`),
  '8004': new RegExp(`^\\d{4}${CSET82}{0,26}$`),
  '8006': /^\d{18}$/,
  '8010': /^\d{4}[#\-/0-9A-Z]{0,26}$/,
  '8013': new RegExp(`^\\d{4}${CSET82}{0,21}$`),
  '8017': /^\d{18}$/,
  '8018': /^\d{18}$/,
};
/** Nombres cortos antiguos permitidos en Digital Link. */
const DL_ALIASES: Record<string, string> = { gtin: '01', cpv: '22', lot: '10', ser: '21', exp: '17', bbd: '15' };

/** Extrae los AIs de una URL GS1 Digital Link, o null si no lo es. */
export function parseDigitalLink(url: string): Gs1Element[] | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const segs = u.pathname.split('/').filter(Boolean).map(safeDecode);
  const normAi = (k: string) => DL_ALIASES[k.toLowerCase()] ?? k;
  const start = segs.findIndex((seg, i) => DL_PRIMARY.has(normAi(seg)) && i + 1 < segs.length);
  if (start < 0) return null;

  // La clave principal tiene que tener su formato: si no, es una URL cualquiera (/archive/00/123456, /c/414/2...).
  const primaryAi = normAi(segs[start]!);
  const primaryValue = segs[start + 1]!;
  if (!DL_PRIMARY_SYNTAX[primaryAi]?.test(primaryValue)) return null;

  const elements: Gs1Element[] = [];
  for (let i = start; i + 1 < segs.length; i += 2) {
    const ai = normAi(segs[i]!);
    if (!/^\d{2,4}$/.test(ai) || !(AIS[ai] || (DECIMAL_FAMILIES.has(ai.slice(0, 3)) && validDecimals(ai)))) return null;
    elements.push(dlElement(ai, segs[i + 1]!));
  }
  for (const [key, value] of u.searchParams) {
    const ai = normAi(key);
    if (/^\d{2,4}$/.test(ai) && (AIS[ai] || (DECIMAL_FAMILIES.has(ai.slice(0, 3)) && validDecimals(ai)))) elements.push(dlElement(ai, value));
  }
  const primary = elements[0]!;
  // En Digital Link el GTIN puede ir como GTIN-8/12/13/14: se normaliza a 14 dígitos.
  if (primary.ai === '01') {
    if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(primary.value)) return null;
    elements[0] = withChecks({ ...primary, value: primary.value.padStart(14, '0') });
  }
  return elements;
}

function dlElement(ai: string, value: string): Gs1Element {
  const family = ai.length === 4 && DECIMAL_FAMILIES.has(ai.slice(0, 3));
  const def = family ? AIS[ai.slice(0, 3)] : AIS[ai];
  return withChecks({ ai, value, def, decimals: family ? Number(ai[3]) : undefined });
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// ---- Prefijo GS1 (quién asignó el número, no dónde se fabricó) ----

export type PrefixInfo = { regions: string[] } | { special: MessageKey };

/** Rangos de prefijo de 3 dígitos → códigos de región ISO 3166 (para Intl.DisplayNames) o caso especial. */
const PREFIXES: [number, number, string[] | MessageKey][] = [
  [0, 19, ['US', 'CA']],
  [20, 29, 'prefixRestricted'],
  [30, 39, ['US']],
  [40, 49, 'prefixRestricted'],
  [50, 59, 'prefixCoupon'],
  [60, 139, ['US', 'CA']],
  [200, 299, 'prefixRestricted'],
  [300, 379, ['FR', 'MC']],
  [380, 380, ['BG']],
  [383, 383, ['SI']],
  [385, 385, ['HR']],
  [387, 387, ['BA']],
  [389, 389, ['ME']],
  [390, 390, ['XK']],
  [400, 440, ['DE']],
  [450, 459, ['JP']],
  [460, 469, ['RU']],
  [470, 470, ['KG']],
  [471, 471, ['TW']],
  [474, 474, ['EE']],
  [475, 475, ['LV']],
  [476, 476, ['AZ']],
  [477, 477, ['LT']],
  [478, 478, ['UZ']],
  [479, 479, ['LK']],
  [480, 480, ['PH']],
  [481, 481, ['BY']],
  [482, 482, ['UA']],
  [483, 483, ['TM']],
  [484, 484, ['MD']],
  [485, 485, ['AM']],
  [486, 486, ['GE']],
  [487, 487, ['KZ']],
  [488, 488, ['TJ']],
  [489, 489, ['HK']],
  [490, 499, ['JP']],
  [500, 509, ['GB']],
  [520, 521, ['GR']],
  [528, 528, ['LB']],
  [529, 529, ['CY']],
  [530, 530, ['AL']],
  [531, 531, ['MK']],
  [535, 535, ['MT']],
  [539, 539, ['IE']],
  [540, 549, ['BE', 'LU']],
  [560, 560, ['PT']],
  [569, 569, ['IS']],
  [570, 579, ['DK']],
  [590, 590, ['PL']],
  [594, 594, ['RO']],
  [599, 599, ['HU']],
  [600, 601, ['ZA']],
  [603, 603, ['GH']],
  [604, 604, ['SN']],
  [608, 608, ['BH']],
  [609, 609, ['MU']],
  [611, 611, ['MA']],
  [613, 613, ['DZ']],
  [615, 615, ['NG']],
  [616, 616, ['KE']],
  [617, 617, ['CM']],
  [618, 618, ['CI']],
  [619, 619, ['TN']],
  [620, 620, ['TZ']],
  [621, 621, ['SY']],
  [622, 622, ['EG']],
  [624, 624, ['LY']],
  [625, 625, ['JO']],
  [626, 626, ['IR']],
  [627, 627, ['KW']],
  [628, 628, ['SA']],
  [629, 629, ['AE']],
  [630, 630, ['QA']],
  [631, 631, ['NA']],
  [640, 649, ['FI']],
  [680, 681, ['CN']],
  [690, 699, ['CN']],
  [700, 709, ['NO']],
  [729, 729, ['IL']],
  [730, 739, ['SE']],
  [740, 740, ['GT']],
  [741, 741, ['SV']],
  [742, 742, ['HN']],
  [743, 743, ['NI']],
  [744, 744, ['CR']],
  [745, 745, ['PA']],
  [746, 746, ['DO']],
  [750, 750, ['MX']],
  [754, 755, ['CA']],
  [759, 759, ['VE']],
  [760, 769, ['CH', 'LI']],
  [770, 771, ['CO']],
  [773, 773, ['UY']],
  [775, 775, ['PE']],
  [777, 777, ['BO']],
  [778, 779, ['AR']],
  [780, 780, ['CL']],
  [784, 784, ['PY']],
  [786, 786, ['EC']],
  [789, 790, ['BR']],
  [800, 839, ['IT', 'SM', 'VA']],
  [840, 849, ['ES', 'AD']],
  [850, 850, ['CU']],
  [858, 858, ['SK']],
  [859, 859, ['CZ']],
  [860, 860, ['RS']],
  [865, 865, ['MN']],
  [867, 867, ['KP']],
  [868, 869, ['TR']],
  [870, 879, ['NL']],
  [880, 881, ['KR']],
  [883, 883, ['MM']],
  [884, 884, ['KH']],
  [885, 885, ['TH']],
  [888, 888, ['SG']],
  [890, 890, ['IN']],
  [893, 893, ['VN']],
  [896, 896, ['PK']],
  [899, 899, ['ID']],
  [900, 919, ['AT']],
  [930, 939, ['AU']],
  [940, 949, ['NZ']],
  [950, 952, 'prefixGs1Global'],
  [955, 955, ['MY']],
  [958, 958, ['MO']],
  [960, 969, 'prefixGs1Global'],
  [977, 977, 'prefixIssn'],
  [978, 978, 'prefixIsbn'],
  [980, 980, 'prefixRefund'],
  [981, 984, 'prefixCoupon'],
  [990, 999, 'prefixCoupon'],
];

/** Prefijo GS1 de un GTIN-12/13/14. Los GTIN-8 tienen su propia numeración y no se interpretan. */
export function gtinPrefix(gtin: string): PrefixInfo | null {
  if (!/^(\d{12}|\d{13}|\d{14})$/.test(gtin)) return null;
  const g14 = gtin.padStart(14, '0');
  if (g14.startsWith('000000')) return null; // GTIN-8 rellenado
  // 979-0 es ISMN (partituras); el resto de 979, ISBN.
  if (g14.slice(1, 5) === '9790') return { special: 'prefixIsmn' };
  if (g14.slice(1, 4) === '979') return { special: 'prefixIsbn' };
  const p = Number(g14.slice(1, 4));
  for (const [from, to, info] of PREFIXES) {
    if (p >= from && p <= to) return typeof info === 'string' ? { special: info } : { regions: info };
  }
  return null;
}

// ---- Tablas ISO para AIs de país y moneda (subconjunto; si falta, se muestra el código) ----

export const ISO_COUNTRY: Record<string, string> = {
  '724': 'ES', '250': 'FR', '276': 'DE', '380': 'IT', '620': 'PT', '826': 'GB', '840': 'US', '124': 'CA', '156': 'CN',
  '392': 'JP', '528': 'NL', '056': 'BE', '442': 'LU', '756': 'CH', '040': 'AT', '616': 'PL', '752': 'SE', '578': 'NO',
  '208': 'DK', '246': 'FI', '372': 'IE', '300': 'GR', '203': 'CZ', '348': 'HU', '642': 'RO', '484': 'MX', '076': 'BR',
  '032': 'AR', '152': 'CL', '170': 'CO', '604': 'PE', '356': 'IN', '410': 'KR', '792': 'TR', '504': 'MA', '036': 'AU',
  '554': 'NZ', '710': 'ZA', '818': 'EG', '764': 'TH', '704': 'VN', '360': 'ID', '458': 'MY', '608': 'PH', '643': 'RU',
  '804': 'UA', '100': 'BG', '191': 'HR', '705': 'SI', '703': 'SK', '233': 'EE', '428': 'LV', '440': 'LT', '196': 'CY',
  '470': 'MT', '352': 'IS', '376': 'IL', '682': 'SA', '784': 'AE', '858': 'UY', '600': 'PY', '218': 'EC', '862': 'VE',
};

export const ISO_CURRENCY: Record<string, string> = {
  '978': 'EUR', '840': 'USD', '826': 'GBP', '756': 'CHF', '392': 'JPY', '156': 'CNY', '124': 'CAD', '036': 'AUD',
  '752': 'SEK', '578': 'NOK', '208': 'DKK', '985': 'PLN', '203': 'CZK', '348': 'HUF', '484': 'MXN', '986': 'BRL',
};
