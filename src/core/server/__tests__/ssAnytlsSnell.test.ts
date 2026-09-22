import { describe, it, expect } from 'vitest';
import { getListenerSchema } from '../../../schemas/listeners';
import { ServerYamlExporter } from '../exporters/serverYaml';
import { createListener, createDefaultServerConfig } from '../factory';
import { validateSemantic } from '../validation/semantic';
import {
  base64DecodedByteLength,
  validateShadowsocks,
} from '../validation/semantic/shadowsocks';
import type { ListenerIR } from '../types';

const exporter = new ServerYamlExporter();

function exportOf(listener: ListenerIR): string {
  return exporter.export({ ...createDefaultServerConfig(), listeners: [listener] });
}

describe('shadowsocks family registry', () => {
  it('registers ss/anytls/snell with correct share support and capabilities', () => {
    const ss = getListenerSchema('shadowsocks')!;
    const anytls = getListenerSchema('anytls')!;
    const snell = getListenerSchema('snell')!;

    expect(ss.shareUri).toBe('supported');
    expect(anytls.shareUri).toBe('supported');
    expect(snell.shareUri).toBe('supported');
    expect(ss.capability.udp).toBe(true);
    expect(anytls.capability.reality).toBe(false);
    expect(snell.fields.some((f) => f.key === 'auth.psk')).toBe(true);
  });

  it('exposes the full kcp-tun advanced block gated on its enable flag', () => {
    const fields = getListenerSchema('shadowsocks')!.fields;
    const enable = fields.find((f) => f.key === 'transport.kcpTun.enable')!;
    expect(enable.level).toBe('advanced');

    const gated = fields.filter((f) => f.key.startsWith('transport.kcpTun.'));
    expect(gated.length).toBeGreaterThan(20);
    for (const def of gated) {
      if (def.key === 'transport.kcpTun.enable') continue;
      expect(def.showIf?.[0]?.field).toBe('transport.kcpTun.enable');
      expect(def.showIf?.[0]?.operator).toBe('eq');
    }
  });
});

describe('base64DecodedByteLength', () => {
  it('computes exact byte lengths incl. padding', () => {
    expect(base64DecodedByteLength('AAAAAAAAAAAAAAAAAAAAAA==')).toBe(16);
    expect(base64DecodedByteLength('vlmpIPSyHH6f4S8WVPdRIHIlzmB+GIRfoH3aNJ/t9Gg=')).toBe(32);
    expect(base64DecodedByteLength('AAAA')).toBe(3);
    expect(base64DecodedByteLength('')).toBe(0);
  });
});

describe('SS2022 password/cipher coupling (L4)', () => {
  function ssWith(cipher: string, password: string): ListenerIR {
    const listener = createListener('shadowsocks');
    listener.protocol.cipher = cipher;
    listener.protocol.password = password;
    return listener;
  }

  it('enforces the documented byte lengths per 2022 cipher', () => {
    expect(
      validateShadowsocks(ssWith('2022-blake3-aes-128-gcm', 'A'.repeat(22) + '=='))[0]?.code
    ).toBeUndefined();
    expect(
      validateShadowsocks(ssWith('2022-blake3-aes-256-gcm', 'A'.repeat(43) + '='))
    ).toHaveLength(0);
    expect(
      validateShadowsocks(ssWith('2022-blake3-aes-128-gcm', 'A'.repeat(43) + '='))[0]
    ).toMatchObject({ code: 'server.problem.ss2022PasswordLength', severity: 'error' });
    expect(
      validateShadowsocks(ssWith('2022-blake3-chacha20-poly1305', 'short'))[0]?.code
    ).toBe('server.problem.ss2022PasswordLength');
  });

  it('warns on the none cipher and on unknown ciphers without rejecting them', () => {
    expect(validateShadowsocks(ssWith('none', ''))[0]).toMatchObject({
      code: 'server.problem.ssNoneCipher',
      severity: 'warning',
    });
    expect(validateShadowsocks(ssWith('rc4-md5', 'x'))[0]).toMatchObject({
      code: 'server.problem.ssUnknownCipher',
      severity: 'warning',
    });
    expect(validateShadowsocks(ssWith('aes-256-gcm', 'any-password'))).toHaveLength(0);
  });

  it('keeps anytls inside the four-alternative matrix — reality does not rescue it', () => {
    const bare = createListener('anytls');
    expect(validateSemantic(bare).map((p) => p.code)).toContain(
      'server.problem.insecureLayerRequired'
    );

    const realityAttempt = createListener('anytls');
    realityAttempt.tls.mode = 'reality';
    realityAttempt.tls.reality = {
      dest: 't:443',
      privateKey: 'k',
      shortIds: [],
      serverNames: [],
    };
    // schema never offers reality mode; semantic layer set excludes it too
    expect(validateSemantic(realityAttempt).map((p) => p.code)).toContain(
      'server.problem.insecureLayerRequired'
    );

    const jls = createListener('anytls');
    jls.security.jls = {
      enable: true,
      dest: 'www.example.com:443',
      users: [{ username: 'u', password: 'p' }],
    };
    expect(validateSemantic(jls)).toHaveLength(0);
  });
});

describe('snell export shape', () => {
  it('renders psk/version/udp with official keys', () => {
    const snell = createListener('snell');
    snell.name = 'snell-in';
    snell.port = '10815';
    snell.auth.psk = 'your-password';
    const yaml = exportOf(snell);
    expect(yaml).toContain("port: '10815'");
    expect(yaml).toContain('psk: your-password');
    expect(yaml).toContain('version: 4');
    expect(yaml).toContain('udp: true');
  });

  it('emits obfs-opts only when a mode is chosen', () => {
    const off = createListener('snell');
    expect(exportOf(off)).not.toContain('obfs-opts');

    const tls = createListener('snell');
    tls.protocol['obfs-opts'] = { mode: 'tls', host: 'bing.com' };
    expect(exportOf(tls)).toContain('mode: tls');
    expect(exportOf(tls)).toContain('host: bing.com');
  });

  it('exports simple-obfs and kcp-tun blocks presence-based for shadowsocks', () => {
    const ss = createListener('shadowsocks');
    ss.protocol['simple-obfs'] = { enable: true, mode: 'http', host: 'bing.com' };
    ss.transport.kcpTun = { enable: true, key: 'secret', mtu: 1350 };

    const yaml = exportOf(ss);
    expect(yaml).toContain('simple-obfs:');
    expect(yaml).toContain('kcp-tun:');
    expect(yaml).toContain('mtu: 1350');
  });
});
