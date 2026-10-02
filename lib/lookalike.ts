// Detecta direcciones que se hacen pasar por un sitio conocido: una marca suplantada habitualmente (lib/data/brands.ts)
// o uno de los «sitios de confianza» del usuario. Tres trucos:
// - mencionar la marca en un dominio que no es suyo (paypal.evil.com, paypal-secure.net, evil.com/paypal/);
// - imitar el dominio con una errata o una sustitución (paypa1.com, arnazon.es, rnicrosoft.com);
// - imitarlo con letras de otro alfabeto (аpple.com con «а» cirílica: homógrafo), según el esqueleto de UTS #39.
// Todo en local y sin red. Devuelve datos, no textos: la traducción la hace la interfaz.

import { parse as parseDomain } from 'tldts';
import { skeleton } from './data/confusables';
import { BRANDS, type Brand } from './data/brands';
import { hostToUnicode } from './punycode';

/** Un sitio que se puede imitar: una marca de la lista o un sitio de confianza del usuario. */
export interface Reference extends Pick<Brand, 'name' | 'primary' | 'domains' | 'keywords' | 'tokens'> {
  trusted?: boolean;
}

export type LookalikeKind =
  /** La marca aparece en el host, pero el dominio no es suyo. */
  | 'brand-host'
  /** La marca aparece en la ruta (más débil: puede ser una noticia sobre la marca). */
  | 'brand-path'
  /**
   * El dominio se llama como la marca, pero con otro final (google.co.ke, vodafone.de): casi siempre es de la propia
   * marca en otro país, porque las marcas registran su nombre en muchos dominios. Solo una nota.
   */
  | 'brand-tld'
  /** El dominio es el oficial con letras sustituidas (rn→m, 0→o, 1→l, vv→w): imitación deliberada. */
  | 'typo-swap'
  /** El dominio está a una o dos erratas del oficial (puede ser casualidad). */
  | 'typo-edit'
  /** El dominio, escrito con letras de otro alfabeto, se lee igual que el oficial. */
  | 'homograph';

export interface Lookalike {
  kind: LookalikeKind;
  ref: Reference;
}

export interface IdnInfo {
  /** El host en Unicode, como lo vería el usuario. */
  unicode: string;
  /** Cómo se lee: el esqueleto ASCII del host, si todas sus letras imitan letras latinas. */
  readsAs: string | null;
  /** Alguna etiqueta mezcla alfabetos (latino + cirílico...), el truco clásico de los homógrafos. */
  mixedScripts: boolean;
}

/** Las marcas de la lista, más los sitios de confianza del usuario (dominios registrables). */
export function references(trusted: readonly string[] = []): Reference[] {
  return [...trusted.map(trustedReference), ...BRANDS];
}

/** Un sitio de confianza se protege igual que una marca: su nombre («mibanco» en mibanco.es) es la palabra que se busca. */
export function trustedReference(domain: string): Reference {
  const label = parseDomain(domain).domainWithoutSuffix ?? domain;
  const word = asciiWord(label);
  return {
    name: domain,
    primary: domain,
    domains: [domain],
    // Solo si es lo bastante distintivo para buscarlo dentro de otras palabras; si no, como palabra completa.
    keywords: word.length >= 6 ? [word] : [],
    tokens: word.length >= 3 && word.length < 6 ? [word] : [],
    trusted: true,
  };
}

/**
 * ¿El dominio registrable pertenece a alguno de los sitios? También los dominios bajo el TLD propio de una marca
 * (cloud.microsoft, blog.google): solo la marca puede registrarlos.
 */
export function ownerOf(domain: string, refs: readonly Reference[]): Reference | null {
  const owner = refs.find((r) => r.domains.includes(domain));
  if (owner) return owner;
  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  return refs.find((r) => !r.trusted && officialLabels(r).includes(tld) && parseDomain(domain).publicSuffix === tld) ?? null;
}

/** Información de un host con caracteres internacionales, o null si es ASCII. */
export function idnInfo(host: string): IdnInfo | null {
  const unicode = hostToUnicode(host);
  if (unicode === host) return null;
  const sk = skeleton(unicode).normalize('NFC');
  return {
    unicode,
    readsAs: /^[a-z0-9.-]+$/.test(sk) ? sk : null,
    mixedScripts: unicode.split('.').some(hasMixedScripts),
  };
}

/**
 * Busca si la dirección imita a uno de los sitios. `domain` es el dominio registrable (mainDomain) del host.
 * Si el dominio es de alguno de los sitios, no hay imitación (una noticia de amazon.es que menciona PayPal es normal).
 */
export function findLookalike(host: string, domain: string, pathname: string, refs: readonly Reference[]): Lookalike | null {
  if (ownerOf(domain, refs)) return null;
  // El host es la propia plataforma compartida (googleapis.com, github.io), no un sitio publicado en ella.
  const own = parseDomain(host, { allowPrivateDomains: true });
  if (own.isPrivate && !own.domain) return null;

  // Se analiza el host tal como se lee: con las letras de otros alfabetos convertidas a su equivalente latino.
  const unicode = hostToUnicode(host);
  const readable = unicode === host ? host : skeleton(unicode).normalize('NFC');
  const readableInfo = parseDomain(readable, { allowPrivateDomains: true });

  if (readable !== host && readableInfo.domain) {
    const imitated = ownerOf(readableInfo.domain, refs);
    if (imitated) return { kind: 'homograph', ref: imitated };
  }

  // Palabras del host sin el sufijo público («paypal.secure-login.com» → paypal, secure, login).
  const suffix = readableInfo.publicSuffix ?? '';
  const hostPart = suffix && readable.endsWith(`.${suffix}`) ? readable.slice(0, -suffix.length - 1) : readable;
  const labels = hostPart.split('.').filter(Boolean);
  const words = labels.flatMap((l) => l.split(/[-_]/)).filter(Boolean);

  // Se llama exactamente como la marca, con otro final: la marca en otro país (solo una nota). No en una plataforma
  // compartida (paypal.github.io), donde el nombre lo elige cualquiera.
  const label = readableInfo.domainWithoutSuffix ?? '';
  const sameName = readableInfo.isPrivate ? undefined : refs.find((r) => !r.trusted && officialLabels(r).includes(label));
  if (sameName) return { kind: 'brand-tld', ref: sameName };

  for (const ref of refs) {
    if (mentions(ref, labels, words)) return { kind: 'brand-host', ref };
  }

  // Erratas: se compara la etiqueta registrable y cada parte separada por guiones con los dominios de cada sitio.
  const candidates = [...new Set([label, ...label.split('-')].filter((c) => c.length >= 3))];
  let edit: Lookalike | null = null;
  for (const ref of refs) {
    for (const official of officialLabels(ref)) {
      for (const c of candidates) {
        if (c === official) continue;
        if (swapNormalize(c) === swapNormalize(official)) return { kind: 'typo-swap', ref };
        // Las erratas solo con nombres distintivos: «twister» no imita a «twitter», ni «cloud» a «icloud».
        if (!edit && ref.keywords.includes(official) && isNearMiss(c, official)) edit = { kind: 'typo-edit', ref };
      }
    }
  }
  if (edit && !isOfficialLabelOfAny(label, refs)) return edit;

  // En la ruta solo cuentan las palabras distintivas y completas («/paypal/login», no «/paypalooza»); las comunes
  // («apple», «orange», «correos») aparecen en rutas normales («/recetas/apple-pie»).
  const pathWords = safeDecode(pathname).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  for (const ref of refs) {
    if (pathWords.some((w) => ref.keywords.includes(w))) return { kind: 'brand-path', ref };
  }
  return null;
}

function mentions(ref: Reference, labels: string[], words: string[]) {
  if (words.some((w) => ref.tokens.includes(w))) return true;
  if (labels.some((l) => ref.tokens.includes(l))) return true;
  // Las palabras distintivas se buscan también dentro de las palabras («mypaypalaccount»).
  return ref.keywords.some((k) => labels.some((l) => l.replace(/[-_]/g, '').includes(k)));
}

/** Las etiquetas registrables de los dominios oficiales: «paypal» de paypal.com y de paypal.co.uk. */
const labelCache = new WeakMap<Reference, string[]>();
function officialLabels(ref: Reference): string[] {
  let labels = labelCache.get(ref);
  if (!labels) {
    labels = [...new Set(ref.domains.map((d) => parseDomain(d).domainWithoutSuffix ?? d))];
    labelCache.set(ref, labels);
  }
  return labels;
}

function isOfficialLabelOfAny(label: string, refs: readonly Reference[]) {
  return refs.some((r) => officialLabels(r).includes(label));
}

/** Sustituciones visuales típicas en los dominios falsos. Se aplican a los dos lados antes de comparar. */
export function swapNormalize(s: string): string {
  return s.replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/0/g, 'o').replace(/1/g, 'l');
}

/**
 * ¿Está a pocas erratas del oficial? Una errata en nombres de 6 o más letras; dos en los de 10 o más.
 * Los nombres cortos («dhl», «ing») tienen demasiados vecinos legítimos: para ellos solo cuentan las sustituciones.
 */
function isNearMiss(candidate: string, official: string): boolean {
  if (official.length < 6) return false;
  // Si uno contiene al otro, es otra palabra (telegra.ph, correios), no una errata.
  if (candidate.includes(official) || official.includes(candidate)) return false;
  const max = official.length >= 10 ? 2 : 1;
  if (Math.abs(candidate.length - official.length) > max) return false;
  return editDistance(candidate, official, max) <= max;
}

/** Distancia de Damerau-Levenshtein (alineación óptima), cortando en cuanto supera `max`. */
export function editDistance(a: string, b: string, max = Infinity): number {
  const rows: number[][] = [Array.from({ length: b.length + 1 }, (_, j) => j)];
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(rows[i - 1]![j]! + 1, row[j - 1]! + 1, rows[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, rows[i - 2]![j - 2]! + 1);
      row.push(d);
      best = Math.min(best, d);
    }
    if (best > max) return best;
    rows.push(row);
  }
  return rows[a.length]![b.length]!;
}

// Alfabetos que se distinguen al comprobar mezclas. Han, Hiragana, Katakana y Hangul se combinan legítimamente
// entre sí y con el latino (japonés, coreano, chino): esas mezclas no cuentan, como en el nivel «Highly Restrictive» de UTS #39.
const SCRIPTS: [string, RegExp][] = [
  ['Latin', /\p{Script=Latin}/u],
  ['Cyrillic', /\p{Script=Cyrillic}/u],
  ['Greek', /\p{Script=Greek}/u],
  ['Armenian', /\p{Script=Armenian}/u],
  ['Georgian', /\p{Script=Georgian}/u],
  ['Cherokee', /\p{Script=Cherokee}/u],
  ['Arabic', /\p{Script=Arabic}/u],
  ['Hebrew', /\p{Script=Hebrew}/u],
  ['Thai', /\p{Script=Thai}/u],
  ['Devanagari', /\p{Script=Devanagari}/u],
  ['Han', /\p{Script=Han}/u],
  ['Hiragana', /\p{Script=Hiragana}/u],
  ['Katakana', /\p{Script=Katakana}/u],
  ['Hangul', /\p{Script=Hangul}/u],
  ['Bopomofo', /\p{Script=Bopomofo}/u],
];
const CJK_COMBOS = [
  ['Latin', 'Han', 'Hiragana', 'Katakana'],
  ['Latin', 'Han', 'Hangul'],
  ['Latin', 'Han', 'Bopomofo'],
];

export function hasMixedScripts(label: string): boolean {
  const found = new Set<string>();
  for (const ch of label) {
    // Los signos comunes a varios alfabetos (la «ー» japonesa, los acentos combinantes) no cuentan.
    if (!/\p{L}/u.test(ch) || /[\p{Script=Common}\p{Script=Inherited}]/u.test(ch)) continue;
    const script = SCRIPTS.find(([, re]) => re.test(ch))?.[0] ?? 'Other';
    found.add(script);
  }
  if (found.size < 2) return false;
  return !CJK_COMBOS.some((combo) => [...found].every((s) => combo.includes(s)));
}

function asciiWord(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
