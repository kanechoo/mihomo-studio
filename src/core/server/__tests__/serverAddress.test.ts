import { describe, it, expect } from 'vitest';
import { isValidServerAddress } from '../validation/syntax';

// The Overview Server list's gatekeeper. Everything a share link can point
// at is a bare domain or IP; anything that merely looks like one is refused.
describe('isValidServerAddress', () => {
  it('accepts domains and IPs', () => {
    expect(isValidServerAddress('vpn.example.com')).toBe(true);
    expect(isValidServerAddress('localhost')).toBe(true);
    expect(isValidServerAddress('203.0.113.7')).toBe(true);
    expect(isValidServerAddress('2001:db8::1')).toBe(true);
  });

  it('rejects prose, URLs, ports and malformed labels', () => {
    expect(isValidServerAddress('not a host!')).toBe(false);
    expect(isValidServerAddress('http://x.com')).toBe(false);
    expect(isValidServerAddress('1.2.3.4:443')).toBe(false);
    expect(isValidServerAddress('-bad.com')).toBe(false);
    expect(isValidServerAddress('a..b.com')).toBe(false);
    expect(isValidServerAddress('')).toBe(false);
  });

  it('treats digits-and-dots strings as IPv4 or nothing', () => {
    // These pass the hostname check (digits are legal label characters) but
    // read as broken IPv4 to anyone typing them.
    expect(isValidServerAddress('256.1.1.1')).toBe(false);
    expect(isValidServerAddress('1.2.3')).toBe(false);
    expect(isValidServerAddress('1.2.3.4.5')).toBe(false);
  });
});
