import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import {
  generateRealityKeypair,
  deriveRealityPublicKey,
} from '../../shared/generators/reality';
import { createListener } from '../factory';
import { generateProxyShare } from '../share';

const b64 = (bytes: Uint8Array): string => {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
};
const b64url = (bytes: Uint8Array): string =>
  b64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const hexToBytes = (hex: string): Uint8Array =>
  new Uint8Array(hex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));

describe('deriveRealityPublicKey', () => {
  // RFC 7748 §6.1: X25519(base point, alice's private key).
  it('derives the public key per the RFC 7748 test vector', () => {
    const priv = '77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a';
    const pub = '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a';
    expect(deriveRealityPublicKey(b64url(hexToBytes(priv)))).toBe(b64url(hexToBytes(pub)));
  });

  it('round-trips a generated pair', () => {
    const { privateKey, publicKey } = generateRealityKeypair();
    expect(deriveRealityPublicKey(privateKey)).toBe(publicKey);
  });

  it('accepts url-safe and unpadded spellings', () => {
    const privB64 = b64(hexToBytes('77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a'));
    const std = deriveRealityPublicKey(privB64);
    // Clients emit the private scalar in any base64 spelling; all spellings
    // decode to the same 32 bytes, so all produce the same public key.
    const unpadded = privB64.replace(/=+$/, '');
    const urlSafe = unpadded.replace('+', '-').replace('/', '_');
    expect(deriveRealityPublicKey(unpadded)).toBe(std);
    expect(deriveRealityPublicKey(urlSafe)).toBe(std);
    expect(deriveRealityPublicKey(privB64)).toBe(std);
  });

  it('refuses values that are not a 32-byte scalar', () => {
    expect(deriveRealityPublicKey('')).toBeUndefined();
    expect(deriveRealityPublicKey('not base64!!')).toBeUndefined();
    expect(deriveRealityPublicKey(btoa('short'))).toBeUndefined();
  });
});

describe('proxy shares carry the stored REALITY public key', () => {
  function realityListener(type: 'vless' | 'trojan') {
    const listener = createListener(type);
    listener.name = `reality-${type}`;
    listener.auth.users = [
      type === 'vless'
        ? { username: '', uuid: 'u-1', flow: '' }
        : { username: 'u', password: 'pw' },
    ];
    listener.tls = {
      mode: 'reality',
      reality: {
        dest: 'test.com:443',
        privateKey: 'rk',
        shortIds: ['ABCD'],
        serverNames: ['sni.com'],
        publicKey: 'PUBKEY123',
      },
    };
    return listener;
  }

  function realityOptsOf(listener: ReturnType<typeof realityListener>) {
    const node = (yaml.load(generateProxyShare(listener, 'e.com').yaml!) as Record<string, any>)
      .proxies[0];
    return node['reality-opts'];
  }

  it('vless emits public-key from the document and drops the manual warning', () => {
    const result = generateProxyShare(realityListener('vless'), 'e.com');
    expect(realityOptsOf(realityListener('vless'))).toMatchObject({ 'public-key': 'PUBKEY123' });
    expect(result.warnings).not.toContain('server.share.realityPublicKeyManual');
  });

  it('vless warns when the private key has no stored counterpart yet', () => {
    const listener = realityListener('vless');
    listener.tls.reality!.publicKey = undefined;
    const result = generateProxyShare(listener, 'e.com');
    expect(realityOptsOf(listener)['public-key']).toBeUndefined();
    expect(result.warnings).toContain('server.share.realityPublicKeyManual');
  });

  it('trojan emits public-key the same way', () => {
    const result = generateProxyShare(realityListener('trojan'), 'e.com');
    expect(realityOptsOf(realityListener('trojan'))).toMatchObject({ 'public-key': 'PUBKEY123' });
    expect(result.warnings).not.toContain('server.share.realityPublicKeyManual');

    const listener = realityListener('trojan');
    listener.tls.reality!.publicKey = undefined;
    expect(generateProxyShare(listener, 'e.com').warnings).toContain(
      'server.share.realityPublicKeyManual'
    );
  });
});
