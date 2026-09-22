export interface PasswordOptions {
  length?: number;
  upper?: boolean;
  lower?: boolean;
  digits?: boolean;
  special?: boolean;
  excludeAmbiguous?: boolean;
}

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const SPECIAL = '!@#$%^&*()-_=+[]{};:,.?';
const AMBIGUOUS = /[Il1O0o|]/g;

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function randomInt(maxExclusive: number): number {
  if (maxExclusive <= 0 || maxExclusive > 0x100000000) {
    throw new RangeError('maxExclusive out of range');
  }
  const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
  const buf = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % maxExclusive;
  }
}

function pick(pool: string): string {
  return pool.charAt(randomInt(pool.length));
}

/** Unbiased uniform integer in [minInclusive, maxInclusive]. */
export function randomIntInRange(minInclusive: number, maxInclusive: number): number {
  if (maxInclusive < minInclusive) {
    throw new RangeError('maxInclusive below minInclusive');
  }
  return minInclusive + randomInt(maxInclusive - minInclusive + 1);
}

export function randomUuid(): string {
  if (typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20
  )}-${hex.slice(20)}`;
}

export function generatePassword(options: PasswordOptions = {}): string {
  const {
    length = 16,
    upper = true,
    lower = true,
    digits = true,
    special = false,
    excludeAmbiguous = true,
  } = options;

  const strip = (set: string) => (excludeAmbiguous ? set.replace(AMBIGUOUS, '') : set);
  const pools: string[] = [];
  if (upper) pools.push(strip(UPPER));
  if (lower) pools.push(strip(LOWER));
  if (digits) pools.push(strip(DIGITS));
  if (special) pools.push(SPECIAL);
  const active = pools.filter((pool) => pool.length > 0);
  if (active.length === 0) return '';

  const all = active.join('');
  const chars: string[] = active.map((pool) => pick(pool));
  while (chars.length < length) {
    chars.push(pick(all));
  }

  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.slice(0, length).join('');
}

export function generateToken(byteLength = 24): string {
  const bytes = randomBytes(byteLength);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function generateHex(byteLength = 8): string {
  return toHex(randomBytes(byteLength));
}

const SHORT_ID_MAX_HEX = 16;

export function generateShortId(): string {
  return generateHex(SHORT_ID_MAX_HEX / 2);
}

export function generateBase64(byteLength = 24): string {
  const bytes = randomBytes(byteLength);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

export function generateSS2022Password(keyByteLength: number): string {
  return generateBase64(keyByteLength);
}

export type SecretGeneratorKind =
  | 'uuid'
  | 'password'
  | 'token'
  | 'short-id'
  | 'hex'
  | 'base64'
  // Shadowsocks-2022 passwords are not free-form strings: the cipher fixes the
  // key length, and the password is the base64 of exactly that many random
  // bytes (16 for aes-128-gcm, 32 for aes-256-gcm / chacha20-poly1305).
  | 'ss2022-16'
  | 'ss2022-32'
  // A WireGuard pre-shared key is exactly 32 random bytes, base64-encoded —
  // the same output `wg genpsk` produces.
  | 'base64-32';

export function generateByKind(kind: SecretGeneratorKind): string {
  switch (kind) {
    case 'uuid':
      return randomUuid();
    case 'password':
      return generatePassword();
    case 'token':
      return generateToken();
    case 'short-id':
      return generateShortId();
    case 'hex':
      return generateHex();
    case 'base64':
      return generateBase64();
    case 'ss2022-16':
      return generateSS2022Password(16);
    case 'ss2022-32':
      return generateSS2022Password(32);
    case 'base64-32':
      return generateBase64(32);
    default:
      return '';
  }
}
