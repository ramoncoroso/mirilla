// Comprobación de direcciones de criptomonedas sin dependencias externas.
// parseCode es síncrono (lo llama el content script al decodificar), así que no podemos usar
// crypto.subtle.digest (async): de ahí la implementación propia de SHA-256 más abajo, usada para
// el doble hash de Base58Check de las direcciones Bitcoin "legacy".

// --- SHA-256 (FIPS 180-4), síncrono -----------------------------------------------------------

const SHA256_K = Uint32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const SHA256_H0 = Uint32Array.from([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/** SHA-256 de `data`, síncrono (sin WebCrypto). */
export function sha256(data: Uint8Array): Uint8Array {
  const bitLen = data.length * 8;
  // Relleno: 0x80, ceros, y la longitud en bits (64 bits) al final; todo múltiplo de 64 bytes.
  const padded = new Uint8Array((((data.length + 9 + 63) >> 6) << 6));
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  // La longitud en bits cabe sobradamente en 32 bits para lo que procesamos aquí (direcciones, nunca archivos).
  view.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(padded.length - 4, bitLen >>> 0, false);

  const h = SHA256_H0.slice();
  const w = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const w15 = w[i - 15]!;
      const w2 = w[i - 2]!;
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) | 0;
    }
    let a = h[0]!, b = h[1]!, c = h[2]!, d = h[3]!, e = h[4]!, f = h[5]!, g = h[6]!, hh = h[7]!;
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + s1 + ch + SHA256_K[i]! + w[i]!) | 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;
      hh = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    h[0] = (h[0]! + a) | 0; h[1] = (h[1]! + b) | 0; h[2] = (h[2]! + c) | 0; h[3] = (h[3]! + d) | 0;
    h[4] = (h[4]! + e) | 0; h[5] = (h[5]! + f) | 0; h[6] = (h[6]! + g) | 0; h[7] = (h[7]! + hh) | 0;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, h[i]! >>> 0, false);
  return out;
}

// --- Base58Check (direcciones "legacy": P2PKH, P2SH) ------------------------------------------

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Decodifica Base58 a bytes, o null si hay un carácter fuera del alfabeto. */
function base58Decode(s: string): Uint8Array | null {
  if (!s) return null;
  let num = 0n;
  for (const ch of s) {
    const v = BASE58_ALPHABET.indexOf(ch);
    if (v < 0) return null;
    num = num * 58n + BigInt(v);
  }
  let hex = num.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  const bytes = num === 0n ? [] : (hex.match(/.{2}/g) ?? []).map((b) => parseInt(b, 16));
  // Cada '1' inicial en Base58 representa un byte 0x00 que la conversión numérica pierde.
  let leadingZeros = 0;
  for (const ch of s) {
    if (ch === '1') leadingZeros++;
    else break;
  }
  return Uint8Array.from([...new Array(leadingZeros).fill(0), ...bytes]);
}

// Byte de versión → tipo de dirección (P2PKH/P2SH, mainnet/testnet). Aceptamos testnet también.
const BASE58_VERSIONS = new Set([0x00, 0x05, 0x6f, 0xc4]);

function isValidBase58Address(address: string): boolean {
  const decoded = base58Decode(address);
  if (!decoded || decoded.length !== 25) return false;
  if (!BASE58_VERSIONS.has(decoded[0]!)) return false;
  const payload = decoded.slice(0, 21);
  const checksum = decoded.slice(21);
  const hash = sha256(sha256(payload));
  for (let i = 0; i < 4; i++) if (hash[i] !== checksum[i]) return false;
  return true;
}

// --- Bech32 (BIP 173) / Bech32m (BIP 350): direcciones SegWit --------------------------------

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32_CONST = 1;
const BECH32M_CONST = 0x2bc830a3;

function bech32Polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((b >>> i) & 1) chk ^= GEN[i]!;
    }
  }
  return chk >>> 0;
}

function bech32HrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (const ch of hrp) out.push(ch.charCodeAt(0) >>> 5);
  out.push(0);
  for (const ch of hrp) out.push(ch.charCodeAt(0) & 31);
  return out;
}

interface Bech32Decoded {
  hrp: string;
  /** Los valores de 5 bits, sin el checksum final. */
  data: number[];
  encoding: 'bech32' | 'bech32m';
}

/** Decodifica una cadena Bech32/Bech32m ya en minúsculas. BIP 173 §"Decoding". */
function bech32Decode(address: string): Bech32Decoded | null {
  if (address.length < 8 || address.length > 90) return null;
  for (let i = 0; i < address.length; i++) {
    const c = address.charCodeAt(i);
    if (c < 33 || c > 126) return null;
  }
  const pos = address.lastIndexOf('1');
  if (pos < 1 || pos + 7 > address.length) return null;
  const hrp = address.slice(0, pos);
  const dataPart = address.slice(pos + 1);
  const values: number[] = [];
  for (const ch of dataPart) {
    const v = BECH32_CHARSET.indexOf(ch);
    if (v < 0) return null;
    values.push(v);
  }
  const poly = bech32Polymod([...bech32HrpExpand(hrp), ...values]);
  let encoding: 'bech32' | 'bech32m';
  if (poly === BECH32_CONST) encoding = 'bech32';
  else if (poly === BECH32M_CONST) encoding = 'bech32m';
  else return null;
  return { hrp, data: values.slice(0, -6), encoding };
}

/** Reagrupa bits (p. ej. de grupos de 5 a bytes de 8). BIP 173 §"convertbits". */
function convertBits(data: number[], fromBits: number, toBits: number, pad: boolean): number[] | null {
  let acc = 0;
  let bits = 0;
  const ret: number[] = [];
  const maxv = (1 << toBits) - 1;
  for (const value of data) {
    if (value < 0 || value >> fromBits) return null;
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      ret.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) ret.push((acc << (toBits - bits)) & maxv);
  } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv)) {
    return null;
  }
  return ret;
}

function isValidSegwitAddress(address: string): boolean {
  // BIP 173: la dirección no puede mezclar mayúsculas y minúsculas.
  if (/[a-z]/.test(address) && /[A-Z]/.test(address)) return false;
  const decoded = bech32Decode(address.toLowerCase());
  if (!decoded) return false;
  if (decoded.hrp !== 'bc' && decoded.hrp !== 'tb') return false;
  if (decoded.data.length < 1) return false;
  const witnessVersion = decoded.data[0]!;
  if (witnessVersion > 16) return false;
  const program = convertBits(decoded.data.slice(1), 5, 8, false);
  if (!program || program.length < 2 || program.length > 40) return false;
  if (witnessVersion === 0) {
    // BIP 141: el programa de la v0 es un hash de 20 (P2WPKH) o 32 bytes (P2WSH), y usa Bech32.
    if (program.length !== 20 && program.length !== 32) return false;
    return decoded.encoding === 'bech32';
  }
  // BIP 350: a partir de la v1 (taproot y futuras) el checksum es Bech32m, no Bech32.
  return decoded.encoding === 'bech32m';
}

// --- API pública --------------------------------------------------------------------------

/**
 * Valida una dirección Bitcoin: Base58Check legacy (P2PKH, P2SH; mainnet y testnet) o
 * Bech32/Bech32m SegWit (P2WPKH, P2WSH, taproot...; mainnet "bc" y testnet "tb").
 */
export function isValidBitcoinAddress(address: string): boolean {
  if (!address) return false;
  if (/^(bc|tb)1/i.test(address)) return isValidSegwitAddress(address);
  return isValidBase58Address(address);
}

/**
 * Comprueba el formato de una dirección Ethereum (0x + 40 hex). No valida el checksum EIP-55
 * (mezcla de mayúsculas/minúsculas derivada de Keccak-256): haría falta implementar Keccak, que
 * no usa el resto de la extensión, así que una dirección con checksum incorrecto se acepta igual.
 */
export function isEthereumAddressFormat(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}
