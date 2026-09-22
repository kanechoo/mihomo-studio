import { describe, it, expect } from 'vitest';
import {
  isValidUuid,
  isValidIpv4,
  isValidIpv6,
  isValidIpAddress,
  isValidCidr,
  isValidHostname,
  isValidHostPort,
  isValidUrl,
  isBase64,
  isHex,
  isValidRegex,
  looksLikePath,
  isValidListenAddress,
  isValidPem,
} from '../validation/syntax';

describe('L1 syntax primitives', () => {
  it('validates UUIDs (lowercase RFC form only)', () => {
    expect(isValidUuid('9d0cb9d0-964f-4ef6-897d-6c6b3ccf9e68')).toBe(true);
    expect(isValidUuid('00000000-0000-0000-0000-000000000001')).toBe(true);
    expect(isValidUuid('')).toBe(false);
    expect(isValidUuid('not-a-uuid')).toBe(false);
    expect(isValidUuid('9d0cb9d0964f4ef6897d6c6b3ccf9e68')).toBe(false);
    expect(isValidUuid('9D0CB9D0-964F-4EF6-897D-6C6B3CCF9E68')).toBe(true);
  });

  it('validates IPv4 with octet bounds', () => {
    expect(isValidIpv4('192.168.1.1')).toBe(true);
    expect(isValidIpv4('0.0.0.0')).toBe(true);
    expect(isValidIpv4('255.255.255.255')).toBe(true);
    expect(isValidIpv4('256.1.1.1')).toBe(false);
    expect(isValidIpv4('1.2.3')).toBe(false);
    expect(isValidIpv4('::1')).toBe(false);
  });

  it('validates IPv6 including :: compression and zones', () => {
    expect(isValidIpv6('::')).toBe(true);
    expect(isValidIpv6('::1')).toBe(true);
    expect(isValidIpv6('2001:db8::8a2e:370:7334')).toBe(true);
    expect(isValidIpv6('fe80::1%eth0')).toBe(true);
    expect(isValidIpv6('fe80::1%')).toBe(false);
    expect(isValidIpv6('192.168.0.1')).toBe(false);
    expect(isValidIpv6('2001:db8:::1')).toBe(false);
  });

  it('validates either IP family', () => {
    expect(isValidIpAddress('10.0.0.1')).toBe(true);
    expect(isValidIpAddress('fd00::1')).toBe(true);
    expect(isValidIpAddress('example.com')).toBe(false);
  });

  it('validates CIDR prefixes per family width', () => {
    expect(isValidCidr('198.18.0.1/16')).toBe(true);
    expect(isValidCidr('0.0.0.0/0')).toBe(true);
    expect(isValidCidr('10.0.0.0/33')).toBe(false);
    expect(isValidCidr('fdfe:dcba:9877::1/126')).toBe(true);
    expect(isValidCidr('fdfe:dcba:9877::1/129')).toBe(false);
    expect(isValidCidr('198.18.0.1')).toBe(false);
    expect(isValidCidr('example.com/24')).toBe(false);
  });

  it('validates hostname labels', () => {
    expect(isValidHostname('example.com')).toBe(true);
    expect(isValidHostname('a-b.example.co')).toBe(true);
    expect(isValidHostname('-bad.example.com')).toBe(false);
    expect(isValidHostname('good..double')).toBe(false);
    expect(isValidHostname('trailing.')).toBe(false);
    expect(isValidHostname('')).toBe(false);
  });

  it('validates host:port with IPv6 bracket form', () => {
    expect(isValidHostPort('example.com:443')).toBe(true);
    expect(isValidHostPort('127.0.0.1:9090')).toBe(true);
    expect(isValidHostPort('[::1]:443')).toBe(true);
    expect(isValidHostPort('[2001:db8::1]:8443')).toBe(true);
    expect(isValidHostPort('[::1]')).toBe(false);
    expect(isValidHostPort('[::1]:')).toBe(false);
    expect(isValidHostPort('[::1]:99999')).toBe(false);
    expect(isValidHostPort('example.com')).toBe(false);
    expect(isValidHostPort('example.com:0')).toBe(false);
  });

  it('validates URLs against an allow-list of schemes', () => {
    expect(isValidUrl('https://example.com/x')).toBe(true);
    expect(isValidUrl('http://127.0.0.1:8080/')).toBe(true);
    expect(isValidUrl('file:///var/www')).toBe(false);
    expect(isValidUrl('file:///var/www', ['file'])).toBe(true);
    expect(isValidUrl('javascript:alert(1)')).toBe(false);
    expect(isValidUrl('not a url')).toBe(false);
  });

  it('recognises standard and URL-safe base64', () => {
    expect(isBase64('vlmpIPSyHH6f4S8WVPdRIHIlzmB+GIRfoH3aNJ/t9Gg=')).toBe(true);
    expect(isBase64('MDEyMzQ1Njc4OWFiY2RlZg==')).toBe(true);
    expect(isBase64('abc-def_')).toBe(true);
    expect(isBase64('')).toBe(false);
    expect(isBase64('abc def')).toBe(false);
  });

  it('recognises hex strings', () => {
    expect(isHex('0123456789abcdef')).toBe(true);
    expect(isHex('ABCDEF')).toBe(true);
    expect(isHex('')).toBe(false);
    expect(isHex('0x12')).toBe(false);
    expect(isHex('xyz')).toBe(false);
  });

  it('compiles regexes or reports them invalid', () => {
    expect(isValidRegex('^vless$')).toBe(true);
    expect(isValidRegex('^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$')).toBe(true);
    expect(isValidRegex('[')).toBe(false);
    expect(isValidRegex('*')).toBe(false);
  });

  it('distinguishes filesystem paths from inline content', () => {
    expect(looksLikePath('/etc/mihomo/server.crt')).toBe(true);
    expect(looksLikePath('./certs/key.pem')).toBe(true);
    expect(looksLikePath('')).toBe(false);
    expect(looksLikePath('line\nbreak')).toBe(false);
    expect(
      looksLikePath(
        '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----'
      )
    ).toBe(false);
  });

  it('accepts wildcard and loopback listen addresses', () => {
    expect(isValidListenAddress('0.0.0.0')).toBe(true);
    expect(isValidListenAddress('*')).toBe(true);
    expect(isValidListenAddress('::')).toBe(true);
    expect(isValidListenAddress('127.0.0.1')).toBe(true);
    expect(isValidListenAddress('192.168.1.10')).toBe(true);
    expect(isValidListenAddress('999.1.1.1')).toBe(false);
    expect(isValidListenAddress('')).toBe(false);
  });

  it('keeps the canonical PEM validator aligned with the component layer', () => {
    const pem = [
      '-----BEGIN TRUSTTUNNEL CERT-----',
      'AAAA',
      'BBBB',
      '-----END TRUSTTUNNEL CERT-----',
    ].join('\n');
    expect(isValidPem(pem)).toBe(true);
    expect(isValidPem('-----BEGIN A-----\nAA\n-----END B-----')).toBe(false);
  });
});

