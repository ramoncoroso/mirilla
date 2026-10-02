// Comprobaciones sobre números de teléfono leídos de un código (esquema tel:), sin llamar a
// ningún servicio externo: solo mira la forma del número.

/**
 * Un código USSD o MMI (*#06#, *21*...#): marcarlo puede cambiar ajustes del teléfono
 * (desvíos de llamada, códigos de operador...) en vez de llamar a alguien.
 * Los enlaces "tel:" codifican a veces el "#" como "%23", así que también cuenta eso.
 */
export function isUssd(number: string): boolean {
  const compact = number.replace(/\s+/g, '');
  return compact.includes('*') || compact.includes('#') || /%23/i.test(compact);
}

/**
 * Normaliza un número para compararlo: quita espacios, puntos, guiones y paréntesis,
 * y convierte el prefijo internacional "00" en "+".
 */
function normalize(number: string): string {
  const compact = number.replace(/[\s.\-()]/g, '');
  return compact.startsWith('00') ? `+${compact.slice(2)}` : compact;
}

/**
 * Prefijos de tarificación especial por país (coste adicional sobre la llamada normal).
 * Un número EN FORMATO NACIONAL, sin el "+" del país, se interpreta siempre como español:
 * es la única forma de dar algún significado a un número sin prefijo internacional, y es la
 * red en la que vive la inmensa mayoría de quienes usan esta extensión.
 */
const PREMIUM_BY_COUNTRY: ReadonlyArray<{ cc: string; test: (national: string) => string | null }> = [
  {
    // España. Fuente: CNMC, Plan Nacional de Numeración Telefónica — numeración de
    // tarificación adicional (803, 806, 807, 905) e información telefónica (118XX).
    cc: '34',
    test: (n) => {
      for (const p of ['803', '806', '807', '905']) if (n.startsWith(p)) return p;
      if (n.startsWith('118')) return '118';
      return null;
    },
  },
  {
    // Reino Unido. Fuente: Ofcom, National Telephone Numbering Plan — el rango 09 es
    // "premium rate services". En formato +44 el 0 inicial se quita, así que queda "9...".
    cc: '44',
    test: (n) => (n.startsWith('9') ? '09' : null),
  },
  {
    // Francia. Fuente: ARCEP — los números "08 9X" son de tarificación adicional
    // ("numéros à revenu partagé"). En formato +33 el 0 inicial se quita, queda "89...".
    cc: '33',
    test: (n) => (n.startsWith('89') ? '089' : null),
  },
  {
    // Alemania. Fuente: Bundesnetzagentur — rangos "0900" (Mehrwertdienste) y "0137"
    // (Televoting/concursos). En formato +49 el 0 inicial se quita.
    cc: '49',
    test: (n) => {
      if (n.startsWith('900')) return '0900';
      if (n.startsWith('137')) return '0137';
      return null;
    },
  },
  {
    // Italia. Fuente: AGCOM — "899" (numerazioni a sovrapprezzo) y "892" (informazioni
    // commerciali). Son numeraciones no geográficas: no llevan 0 inicial que quitar.
    cc: '39',
    test: (n) => {
      if (n.startsWith('899')) return '899';
      if (n.startsWith('892')) return '892';
      return null;
    },
  },
  {
    // Portugal. Fuente: ANACOM — rango "760"-"762" de tarifação especial.
    cc: '351',
    test: (n) => (/^76[0-2]/.test(n) ? n.slice(0, 3) : null),
  },
];

/** Número de tarificación especial (coste adicional). Devuelve el prefijo encontrado, con el código de país, o null. */
export function premiumPrefix(number: string): string | null {
  const n = normalize(number);

  if (!n.startsWith('+')) {
    // Sin prefijo internacional: se asume numeración española (ver PREMIUM_BY_COUNTRY).
    const spain = PREMIUM_BY_COUNTRY[0]!;
    const hit = spain.test(n);
    return hit ? `+${spain.cc} ${hit}` : null;
  }

  for (const country of PREMIUM_BY_COUNTRY) {
    if (n.startsWith(`+${country.cc}`)) {
      const national = n.slice(1 + country.cc.length);
      const hit = country.test(national);
      return hit ? `+${country.cc} ${hit}` : null;
    }
  }
  return null;
}
