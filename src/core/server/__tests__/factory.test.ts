import { describe, it, expect } from 'vitest';
import {
  LISTENER_KINDS,
  createDefaultServerConfig,
  createListener,
  yamlTypeOf,
} from '../factory';
import { isValidPortExpression } from '../portExpression';

describe('createDefaultServerConfig', () => {
  it('returns an empty project with schemaVersion 1 and DNS disabled', () => {
    const config = createDefaultServerConfig();
    expect(config.schemaVersion).toBe(1);
    expect(config.dns).toEqual({ enable: false });
    expect(config.listeners).toEqual([]);
  });
});

describe('createListener', () => {
  it('covers all 20 listener kinds', () => {
    expect(LISTENER_KINDS.length).toBe(20);
    for (const kind of LISTENER_KINDS) {
      expect(() => createListener(kind)).not.toThrow();
    }
  });

  it('assigns unique ids and official example ports per kind', () => {
    const expected: Record<string, string> = {
      http: '7890',
      socks: '7891',
      mixed: '7892',
      redir: '7893',
      tproxy: '7894',
      shadowsocks: '10001',
      vmess: '10814',
      vless: '10817',
      trojan: '10819',
      anytls: '10818',
      snell: '10815',
      sudoku: '8443',
      trusttunnel: '10821',
      shadowquic: '10822',
      hysteria2: '8443',
      tunnel: '10816',
    };
    for (const [kind, port] of Object.entries(expected)) {
      const listener = createListener(kind as never);
      expect(listener.port).toBe(port);
      expect(isValidPortExpression(listener.port)).toBe(true);
    }

    const a = createListener('vless');
    const b = createListener('vless');
    expect(a.id).not.toBe(b.id);
  });

  it('defaults listen to the wildcard and enables new listeners', () => {
    const listener = createListener('http');
    expect(listener.listen).toBe('0.0.0.0');
    expect(listener.enabled).toBe(true);
    expect(listener.name).toBe('http-in');
    expect(listener.extensions).toEqual({});
    expect(listener.security).toEqual({});
  });

  it('distinguishes TUIC v4 token auth from TUIC v5 map auth under one YAML type', () => {
    const v4 = createListener('tuic', 'v4');
    const v5 = createListener('tuic', 'v5');

    expect(v4.type).toBe('tuic');
    expect(v5.type).toBe('tuic');
    expect(v4.tuicVersion).toBe('v4');
    expect(v5.tuicVersion).toBe('v5');

    expect(v4.auth.mode).toBe('token');
    expect(v4.auth.token).toEqual(['']);
    expect(v5.auth.mode).toBe('map');
    expect(v5.auth.users).toHaveLength(1);

    expect(v4.port).toBe('10003');
    expect(v5.port).toBe('10004');
  });

  it('inherits global auth for app-proxy listeners and skips auth for transparent ones', () => {
    expect(createListener('http').auth.mode).toBe('inherit');
    expect(createListener('socks').auth.mode).toBe('inherit');
    expect(createListener('mixed').auth.mode).toBe('inherit');
    expect(createListener('redir').auth.mode).toBe('none');
    expect(createListener('tproxy').auth.mode).toBe('none');
    expect(createListener('tun').auth.mode).toBe('none');
  });

  it('uses psk auth for snell with version 4 default', () => {
    const snell = createListener('snell');
    expect(snell.auth.mode).toBe('psk');
    expect(snell.auth.psk).toBe('');
    expect(snell.protocol.version).toBe(4);
    expect(snell.protocol.udp).toBe(true);
  });

  it('seeds transport only for ws/grpc/xhttp-capable encrypted protocols', () => {
    expect(createListener('vless').transport.kind).toBe('tcp');
    expect(createListener('vmess').transport.kind).toBe('tcp');
    expect(createListener('trojan').transport.kind).toBe('tcp');
    expect(createListener('hysteria2').transport.kind).toBe('none');
    expect(createListener('shadowsocks').transport.kind).toBe('none');
  });

  it('starts TLS-capable listeners in tls mode and others in none', () => {
    for (const kind of ['http', 'socks', 'mixed', 'vmess', 'vless', 'trojan', 'anytls', 'trusttunnel', 'tuic', 'hysteria2', 'hysteria2-realm']) {
      expect(createListener(kind as never).tls.mode).toBe('tls');
    }
    for (const kind of ['redir', 'tproxy', 'tun', 'shadowsocks', 'snell', 'mieru', 'sudoku', 'shadowquic', 'tunnel']) {
      expect(createListener(kind as never).tls.mode).toBe('none');
    }
  });

  it('seeds protocol defaults documented by mihomo examples', () => {
    expect(createListener('tunnel').protocol).toEqual({
      network: ['tcp', 'udp'],
      target: '',
    });
    expect(createListener('tun').protocol.stack).toBe('system');
    expect(createListener('trusttunnel').protocol.network).toEqual(['tcp', 'udp']);
    expect(createListener('mieru').protocol.transport).toBe('TCP');
    expect(createListener('sudoku').protocol['aead-method']).toBe(
      'chacha20-poly1305'
    );
    expect(createListener('hysteria2').protocol.alpn).toEqual(['h3']);
    expect(createListener('tproxy').protocol.udp).toBe(true);
    expect(createListener('socks').protocol.udp).toBe(true);
    expect(createListener('vless').protocol.udp).toBeUndefined();
  });

  it('maps every kind to its official YAML type string', () => {
    expect(yamlTypeOf('tuic')).toBe('tuic');
    expect(yamlTypeOf('hysteria2-realm')).toBe('hysteria2-realm');
    expect(yamlTypeOf('redir')).toBe('redir');
    expect(yamlTypeOf('shadowsocks')).toBe('shadowsocks');
  });
});
