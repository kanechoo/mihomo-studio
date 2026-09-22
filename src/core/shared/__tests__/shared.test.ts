import { describe, it, expect } from 'vitest';
import {
  randomUuid,
  generatePassword,
  generateToken,
  generateShortId,
  generateHex,
  generateBase64,
  generateSS2022Password,
  generateByKind,
} from '../generators/crypto';
import { generateRealityKeypair } from '../generators/reality';
import { x25519 } from '@noble/curves/ed25519';
import {
  isValidUuid,
  isValidIpv4,
  isValidIpv6,
  isValidCidr,
  isValidHostname,
  isValidHostPort,
  isBase64,
  isValidPem,
} from '../validation/syntax';

describe('shared crypto generators', () => {
  it('produces parseable v4 UUIDs', () => {
    const uuid = randomUuid();
    expect(isValidUuid(uuid)).toBe(true);
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(randomUuid()).not.toBe(uuid);
  });

  it('generates passwords honoring pool constraints', () => {
    const password = generatePassword({ length: 24 });
    expect(password).toHaveLength(24);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/\d/);
    expect(password).not.toMatch(/[Il1O0o|]/);
    const withSpecial = generatePassword({ length: 32, special: true });
    expect(withSpecial).toMatch(/[!@#$%^&*()\-_=[\]{};:,.?]/);
  });

  it('returns base64url tokens and hex strings of the right shape', () => {
    expect(generateToken(32)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateHex(16)).toMatch(/^[0-9a-f]{32}$/);
    expect(generateShortId()).toMatch(/^[0-9a-f]{16}$/);
  });

  it('produces standard base64 payloads including SS2022 key material', () => {
    // 2022-blake3-aes-128-gcm wants exactly 16 bytes; aes-256-gcm 32.
    expect(generateSS2022Password(16)).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(generateBase64(3)).toMatch(/^[A-Za-z0-9+/]{4}$/);
  });

  it('dispatches SS2022 kinds to cipher-exact key material', () => {
    // base64 of exactly 16 bytes is 24 chars ending in '=='; of exactly 32
    // bytes, 44 chars ending in '='. Anything else fails the SS2022 validator.
    expect(generateByKind('ss2022-16')).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(generateByKind('ss2022-32')).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(atob(generateByKind('ss2022-16'))).toHaveLength(16);
    expect(atob(generateByKind('ss2022-32'))).toHaveLength(32);
  });

  it('dispatches base64-32 to WireGuard-shaped pre-shared keys', () => {
    expect(generateByKind('base64-32')).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(atob(generateByKind('base64-32'))).toHaveLength(32);
  });

  it('dispatches every registered kind to a non-empty value', () => {
    for (const kind of [
      'uuid',
      'password',
      'token',
      'short-id',
      'hex',
      'base64',
      'ss2022-16',
      'ss2022-32',
      'base64-32',
    ] as const) {
      expect(generateByKind(kind), kind).not.toBe('');
    }
  });
});

describe('shared reality keypair', () => {
  it('derives the public key from the private key like mihomo does', () => {
    const { privateKey, publicKey } = generateRealityKeypair();
    // Reality keys are URL-safe base64 (no padding), so decode that spelling
    // before reading raw bytes.
    const decodeUrl = (value: string): Uint8Array => {
      const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
      return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    };
    const privBytes = decodeUrl(privateKey);
    const pubBytes = decodeUrl(publicKey);
    expect(privBytes).toHaveLength(32);
    expect(pubBytes).toEqual(x25519.getPublicKey(privBytes));
  });

  it('never repeats a keypair', () => {
    const a = generateRealityKeypair();
    const b = generateRealityKeypair();
    expect(a.privateKey).not.toBe(b.privateKey);
    expect(a.publicKey).not.toBe(b.publicKey);
  });
});

describe('shared syntax primitives', () => {
  it('accepts and rejects addresses, CIDRs and hostnames', () => {
    expect(isValidIpv4('192.168.1.1')).toBe(true);
    expect(isValidIpv4('256.1.1.1')).toBe(false);
    expect(isValidIpv6('::1')).toBe(true);
    expect(isValidIpv6('192.168.1.1')).toBe(false);
    expect(isValidCidr('10.0.0.0/8')).toBe(true);
    expect(isValidCidr('10.0.0.0/33')).toBe(false);
    expect(isValidHostname('example.com')).toBe(true);
    expect(isValidHostname('-bad.example.com')).toBe(false);
    expect(isValidHostPort('[::1]:443')).toBe(true);
    expect(isValidHostPort('example.com:70000')).toBe(false);
  });

  it('checks base64 and PEM shapes', () => {
    expect(isBase64('aGVsbG8=')).toBe(true);
    expect(isBase64('not base64!!')).toBe(false);
    expect(
      isValidPem(
        '-----BEGIN CERTIFICATE-----\nYWJj\n-----END CERTIFICATE-----\n'
      )
    ).toBe(true);
    expect(isValidPem('-----BEGIN CERTIFICATE-----\nyolo\n-----END OTHER-----\n')).toBe(false);
  });
});
