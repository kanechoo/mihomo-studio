import { describe, it, expect } from 'vitest';
import { generatePassword, randomUuid, generateToken, generateHex, generateBase64, generateShortId, generateSS2022Password } from '../generators/crypto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('randomUuid', () => {
  it('produces valid RFC 4122 v4 UUIDs', () => {
    for (let i = 0; i < 50; i++) {
      expect(randomUuid()).toMatch(UUID_RE);
    }
  });

  it('is unique across draws', () => {
    const set = new Set(Array.from({ length: 200 }, () => randomUuid()));
    expect(set.size).toBe(200);
  });
});

describe('generatePassword', () => {
  it('honours length and character-set selection', () => {
    const pw = generatePassword({ length: 24, special: true, excludeAmbiguous: false });
    expect(pw.length).toBe(24);
    expect(pw).toMatch(/[A-Z]/);
    expect(pw).toMatch(/[a-z]/);
    expect(pw).toMatch(/\d/);
  });

  it('excludes ambiguous characters when asked', () => {
    for (let i = 0; i < 20; i++) {
      expect(generatePassword({ length: 32 })).not.toMatch(/[Il1O0o]/);
    }
  });

  it('returns empty string when no character sets are enabled', () => {
    expect(generatePassword({ upper: false, lower: false, digits: false, special: false })).toBe('');
  });

  it('never returns Math.random-style short output', () => {
    for (let i = 0; i < 10; i++) {
      expect(generatePassword({ length: 16 }).length).toBe(16);
    }
  });
});

describe('token/hex/base64 generators', () => {
  it('emits URL-safe base64 tokens without padding', () => {
    for (let i = 0; i < 20; i++) {
      expect(generateToken()).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(generateToken().endsWith('=')).toBe(false);
    }
  });

  it('emits lowercase hex of the requested byte length', () => {
    expect(generateHex(8)).toMatch(/^[0-9a-f]{16}$/);
    expect(generateShortId()).toMatch(/^[0-9a-f]{16}$/);
  });

  it('emits padded standard base64', () => {
    expect(generateBase64(32)).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  });

  it('produces ss2022 keys of the exact encoded length (16 bytes → 24 chars)', () => {
    expect(generateSS2022Password(16)).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(generateSS2022Password(32)).toMatch(/^[A-Za-z0-9+/]{43}=$/);
  });
});
