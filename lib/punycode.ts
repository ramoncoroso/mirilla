// Decodificador de punycode (RFC 3492) para nombres de dominio (IDNA/ACE, prefijo «xn--»).
// Implementación propia porque corre en el service worker de la extensión: sin APIs de Node.

const BASE = 36;
const T_MIN = 1;
const T_MAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 0x80;
const DELIMITER = '-';
const MAX_CODE_POINT = 0x10ffff;

function adapt(delta: number, numPoints: number, firstTime: boolean): number {
  let k = 0;
  let d = firstTime ? Math.floor(delta / DAMP) : Math.floor(delta / 2);
  d += Math.floor(d / numPoints);
  while (d > Math.floor(((BASE - T_MIN) * T_MAX) / 2)) {
    d = Math.floor(d / (BASE - T_MIN));
    k += BASE;
  }
  return k + Math.floor(((BASE - T_MIN + 1) * d) / (d + SKEW));
}

/** Valor (0-35) de un «digit» punycode (0-9, A-Z o a-z); -1 si no es válido. */
function digitValue(code: number): number {
  if (code >= 0x30 && code <= 0x39) return code - 0x30 + 26; // '0'-'9'
  if (code >= 0x41 && code <= 0x5a) return code - 0x41; // 'A'-'Z'
  if (code >= 0x61 && code <= 0x7a) return code - 0x61; // 'a'-'z'
  return -1;
}

/** Decodifica el cuerpo punycode (sin el prefijo «xn--») a un array de code points. Lanza si es inválido. */
function decodePunycode(input: string): number[] {
  let n = INITIAL_N;
  let i = 0;
  let bias = INITIAL_BIAS;
  const output: number[] = [];

  // La parte antes del último '-' son code points ASCII literales.
  let basicEnd = input.lastIndexOf(DELIMITER);
  if (basicEnd < 0) basicEnd = 0;
  for (let j = 0; j < basicEnd; j++) {
    const code = input.charCodeAt(j);
    if (code >= 0x80) throw new Error('carácter no ASCII en la parte básica');
    output.push(code);
  }

  let pos = basicEnd > 0 ? basicEnd + 1 : 0;
  const len = input.length;

  while (pos < len) {
    const oldI = i;
    let w = 1;
    let k = BASE;
    for (;;) {
      if (pos >= len) throw new Error('entrada truncada');
      const digit = digitValue(input.charCodeAt(pos));
      pos++;
      if (digit < 0) throw new Error('dígito punycode inválido');
      // Comprobación de desbordamiento: digit * w no debe desbordar un entero seguro.
      if (digit > Math.floor((Number.MAX_SAFE_INTEGER - i) / w)) throw new Error('desbordamiento');
      i += digit * w;
      const t = k <= bias ? T_MIN : k >= bias + T_MAX ? T_MAX : k - bias;
      if (digit < t) break;
      if (w > Math.floor(Number.MAX_SAFE_INTEGER / (BASE - t))) throw new Error('desbordamiento');
      w *= BASE - t;
      k += BASE;
    }
    const numPoints = output.length + 1;
    bias = adapt(i - oldI, numPoints, oldI === 0);
    if (Math.floor(i / numPoints) > MAX_CODE_POINT - n) throw new Error('desbordamiento de code point');
    n += Math.floor(i / numPoints);
    i %= numPoints;
    if (n > MAX_CODE_POINT || n < 0) throw new Error('code point fuera de rango');
    output.splice(i, 0, n);
    i++;
  }

  return output;
}

/** Decodifica una etiqueta «xn--...» a Unicode. Lanza si la etiqueta no es válida. */
function decodeLabel(label: string): string {
  const body = label.slice(4); // quita el prefijo «xn--»
  if (body.length === 0) throw new Error('etiqueta vacía tras el prefijo');
  const codePoints = decodePunycode(body);
  return String.fromCodePoint(...codePoints);
}

/** Convierte un host en ASCII (con etiquetas xn--) a Unicode. Las etiquetas mal formadas se dejan tal cual. */
export function hostToUnicode(host: string): string {
  return host
    .split('.')
    .map((label) => {
      if (!/^xn--/i.test(label)) return label;
      try {
        return decodeLabel(label.toLowerCase());
      } catch {
        return label;
      }
    })
    .join('.');
}
