import { describe, expect, it } from 'vitest';
import { isEthereumAddressFormat, isValidBitcoinAddress, sha256 } from '@/lib/crypto-address';

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

describe('sha256', () => {
  it('coincide con los vectores de prueba conocidos', () => {
    expect(hex(sha256(new TextEncoder().encode('')))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(hex(sha256(new TextEncoder().encode('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('isValidBitcoinAddress: Base58Check (legacy)', () => {
  it('acepta direcciones P2PKH y P2SH reales (mainnet)', () => {
    expect(isValidBitcoinAddress('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')).toBe(true);
    expect(isValidBitcoinAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toBe(true);
  });

  it('acepta testnet (P2PKH 0x6f y P2SH 0xc4)', () => {
    expect(isValidBitcoinAddress('mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn')).toBe(true);
    expect(isValidBitcoinAddress('2N8hwP1WmJrFF5QWABn38y63uYLhnJYJYTF')).toBe(true);
  });

  it('rechaza una dirección con un carácter cambiado (checksum incorrecto)', () => {
    expect(isValidBitcoinAddress('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN3')).toBe(false);
  });

  it('rechaza cadenas que no son Base58 válido', () => {
    expect(isValidBitcoinAddress('')).toBe(false);
    expect(isValidBitcoinAddress('10OI l')).toBe(false); // caracteres fuera del alfabeto Base58
  });
});

describe('isValidBitcoinAddress: Bech32 (BIP 173) y Bech32m (BIP 350)', () => {
  it('acepta direcciones SegWit v0 válidas (mainnet y testnet, P2WPKH y P2WSH)', () => {
    expect(isValidBitcoinAddress('BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4')).toBe(true);
    expect(isValidBitcoinAddress('tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7')).toBe(true);
    expect(isValidBitcoinAddress('tb1qqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesrxh6hy')).toBe(true);
  });

  it('acepta mayúsculas (un escáner de QR puede devolverlas así)', () => {
    expect(isValidBitcoinAddress('BC1SW50QGDZ25J')).toBe(true);
  });

  it('acepta taproot (v1+, Bech32m) en mainnet y testnet', () => {
    expect(isValidBitcoinAddress('bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0')).toBe(true);
    expect(isValidBitcoinAddress('tb1pqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesf3hn0c')).toBe(true);
    expect(isValidBitcoinAddress('bc1pw508d6qejxtdg4y5r3zarvary0c5xw7kw508d6qejxtdg4y5r3zarvary0c5xw7kt5nd6y')).toBe(true);
    expect(isValidBitcoinAddress('bc1zw508d6qejxtdg4y5r3zarvaryvaxxpcs')).toBe(true);
  });

  it('rechaza HRP desconocido', () => {
    expect(isValidBitcoinAddress('tc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vq5zuyut')).toBe(false);
  });

  it('rechaza Bech32 cuando debía ser Bech32m (v1+) y viceversa (v0)', () => {
    expect(isValidBitcoinAddress('bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqh2y7hd')).toBe(false);
    expect(isValidBitcoinAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kemeawh')).toBe(false);
  });

  it('rechaza carácter inválido en el checksum', () => {
    expect(isValidBitcoinAddress('bc1p38j9r5y49hruaue7wxjce0updqjuyyx0kh56v8s25huc6995vvpql3jow4')).toBe(false);
  });

  it('rechaza versión de testigo inválida (>16)', () => {
    expect(isValidBitcoinAddress('BC130XLXVLHEMJA6C4DQV22UAPCTQUPFHLXM9H8Z3K2E72Q4K9HCZ7VQ7ZWS8R')).toBe(false);
  });

  it('rechaza longitud de programa inválida (1 byte, 41 bytes, o v0 que no es 20/32)', () => {
    expect(isValidBitcoinAddress('bc1pw5dgrnzv')).toBe(false);
    expect(isValidBitcoinAddress('bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7v8n0nx0muaewav253zgeav')).toBe(false);
    expect(isValidBitcoinAddress('BC1QR508D6QEJXTDG4Y5R3ZARVARYV98GJ9P')).toBe(false);
  });

  it('rechaza mayúsculas y minúsculas mezcladas', () => {
    expect(isValidBitcoinAddress('tb1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vq47Zagq')).toBe(false);
  });

  it('rechaza relleno (padding) incorrecto y sección de datos vacía', () => {
    expect(isValidBitcoinAddress('bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7v07qwwzcrf')).toBe(false);
    expect(isValidBitcoinAddress('bc1gmk9yu')).toBe(false);
  });
});

describe('isEthereumAddressFormat', () => {
  it('acepta 0x + 40 hexadecimales', () => {
    expect(isEthereumAddressFormat('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed')).toBe(true);
    expect(isEthereumAddressFormat('0x0000000000000000000000000000000000000000'.slice(0, 42))).toBe(true);
  });

  it('rechaza longitud o prefijo incorrectos', () => {
    expect(isEthereumAddressFormat('5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed')).toBe(false); // sin 0x
    expect(isEthereumAddressFormat('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeA')).toBe(false); // corta
    expect(isEthereumAddressFormat('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAedAB')).toBe(false); // larga
    expect(isEthereumAddressFormat('0xZZAeb6053F3E94C9b9A09f33669435E7Ef1BeAed')).toBe(false); // no hex
  });
});
