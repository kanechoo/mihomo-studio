import { describe, it, expect } from 'vitest';
import {
  ServerYamlExporter,
  camelToKebab,
  listenerToYamlNode,
} from '../exporters/serverYaml';
import { createListener, createDefaultServerConfig } from '../factory';
import type { ListenerIR } from '../types';

const exporter = new ServerYamlExporter();

describe('camelToKebab', () => {
  it('converts typed block keys and honours documented exceptions', () => {
    expect(camelToKebab('noSseHeader')).toBe('no-sse-header');
    expect(camelToKebab('xPaddingBytes')).toBe('x-padding-bytes');
    expect(camelToKebab('scMaxEachPostBytes')).toBe('sc-max-each-post-bytes');
    expect(camelToKebab('uplinkHttpMethod')).toBe('uplink-http-method');
    expect(camelToKebab('maxWriteDurationMs')).toBe('max-write-duration-ms');
    expect(camelToKebab('alterId')).toBe('alterId');
    expect(camelToKebab('udp')).toBe('udp');
  });
});

function withTls(listener: ListenerIR): ListenerIR {
  return {
    ...listener,
    tls: {
      ...listener.tls,
      certificate: { source: 'path', value: './server.crt' },
      privateKey: { source: 'path', value: './server.key' },
    },
  };
}

describe('listenerToYamlNode', () => {
  it('exports a socks listener with users, udp and TLS pair', () => {
    const socks = withTls(createListener('socks'));
    socks.name = 'socks-in';
    socks.port = '7891';
    socks.auth = { mode: 'list', token: [], users: [{ username: 'u1', password: 'p1' }] };

    const node = listenerToYamlNode(socks);
    expect(node).toEqual({
      name: 'socks-in',
      type: 'socks',
      port: '7891',
      listen: '0.0.0.0',
      udp: true,
      users: [{ username: 'u1', password: 'p1' }],
      certificate: './server.crt',
      'private-key': './server.key',
    });
  });

  it('never exports internal fields (id, enabled, tuicVersion)', () => {
    const tuic = createListener('tuic', 'v5');
    const node = listenerToYamlNode(tuic);
    expect(node).not.toHaveProperty('id');
    expect(node).not.toHaveProperty('enabled');
    expect(node).not.toHaveProperty('tuicVersion');
    expect(node.type).toBe('tuic');
  });

  it('exports a half-built reality section instead of crashing on it', () => {
    // The state the editor produces when someone switches the TLS mode to
    // Reality and types a Destination before touching anything else: the
    // section exists with only one key, its list fields still missing.
    const vless = createListener('vless');
    vless.tls = { mode: 'reality', reality: { dest: 'd:443' } } as ListenerIR['tls'];
    const node = listenerToYamlNode(vless);
    expect((node as Record<string, unknown>)['reality-config']).toEqual({
      dest: 'd:443',
    });
  });

  it('emits map-auth as a username:password record for hysteria2', () => {
    const hy2 = createListener('hysteria2');
    hy2.name = 'hy-in';
    hy2.port = '8443';
    hy2.auth = { mode: 'map', token: [], users: [
      { username: 'alice', password: 'secret-a' },
      { username: '', password: 'dropped' },
      { username: 'bob', password: '' },
    ] };
    const node = listenerToYamlNode(hy2) as Record<string, unknown>;
    expect(node.users as Record<string, string>).toEqual({ alice: 'secret-a', bob: '' });
  });

  it('expands reality-config and omits the cert pair in reality mode', () => {
    const vless = createListener('vless');
    vless.name = 'vless-reality';
    vless.port = '443';
    vless.auth = {
      mode: 'list',
      token: [],
      users: [{ username: 'u1', uuid: '9d0cb9d0-964f-4ef6-897d-6c6b3ccf9e68', flow: 'xtls-rprx-vision' }],
    };
    vless.tls = {
      mode: 'reality',
      reality: {
        dest: 'test.com:443',
        privateKey: 'rk',
        shortIds: ['0123456789abcdef', ''],
        serverNames: ['test.com'],
        limitFallbackUpload: { afterBytes: 0, bytesPerSec: 100, burstBytesPerSec: 200 },
      },
    };
    const node = listenerToYamlNode(vless);
    expect(node['reality-config']).toEqual({
      dest: 'test.com:443',
      'private-key': 'rk',
      'short-id': ['0123456789abcdef'],
      'server-names': ['test.com'],
      'limit-fallback-upload': { 'after-bytes': 0, 'bytes-per-sec': 100, 'burst-bytes-per-sec': 200 },
    });
    expect(node).not.toHaveProperty('certificate');
    expect((node.users as Record<string, unknown>[])[0]).toEqual({
      username: 'u1',
      uuid: '9d0cb9d0-964f-4ef6-897d-6c6b3ccf9e68',
      flow: 'xtls-rprx-vision',
    });
  });

  it('passes protocol keys verbatim and extensions last without filtering', () => {
    const tunnel = createListener('tunnel');
    tunnel.name = 'tunnel-in';
    tunnel.port = '10816';
    tunnel.protocol.target = 'target.com';
    tunnel.extensions = { 'brand-new-future-key': { nested: true } };
    const node = listenerToYamlNode(tunnel);
    expect(node.network).toEqual(['tcp', 'udp']);
    expect(node.target).toBe('target.com');
    expect(node['brand-new-future-key']).toEqual({ nested: true });
  });
});

describe('ServerYamlExporter golden (P5 acceptance)', () => {
  it('renders an HTTP+users+TLS listener into official YAML shape', () => {
    const http = createListener('http');
    http.name = 'http-in';
    http.listen = '0.0.0.0';
    http.port = '7890';
    http.auth = { mode: 'list', token: [], users: [{ username: 'user1', password: 'pass1' }] };
    http.tls = {
      mode: 'tls',
      certificate: { source: 'path', value: './server.crt' },
      privateKey: { source: 'path', value: './server.key' },
      clientAuthType: '',
      echKey: '',
    };

    const config = createDefaultServerConfig();
    config.listeners = [http];

    const yaml = exporter.export(config);
    expect(yaml).toBe(
      [
        'mixed-port: 7890',
        'mode: rule',
        'allow-lan: false',
        'log-level: info',
        'ipv6: false',
        'listeners:',
        '  - name: http-in',
        '    type: http',
        "    port: '7890'",
        '    listen: 0.0.0.0',
        '    users:',
        '      - username: user1',
        '        password: pass1',
        '    certificate: ./server.crt',
        '    private-key: ./server.key',
        '',
      ].join('\n')
    );
  });

  it('omits disabled listeners, empty auth, and disabled DNS; quotes numeric ports', () => {
    const on = createListener('mixed');
    on.enabled = true;
    on.name = 'mixed-in';
    on.port = '7892';
    const off = createListener('redir');
    off.enabled = false;

    const config = createDefaultServerConfig();
    config.listeners = [on, off];
    config.dns.enable = false;

    const yaml = exporter.export(config);
    expect(yaml).toContain('- name: mixed-in');
    expect(yaml).not.toContain('redir-in');
    expect(yaml).not.toContain('dns:');
    expect(yaml).toContain("port: '7892'");
  });

  it('renders dns block when enabled with kebab-case keys', () => {
    const config = createDefaultServerConfig();
    config.dns = {
      enable: true,
      listen: '0.0.0.0:1053',
      ipv6: false,
      'enhanced-mode': 'fake-ip',
      'fake-ip-range': '198.18.0.1/16',
      nameserver: ['https://doh.pub/dns-query'],
    };
    const yaml = exporter.export(config);
    expect(yaml).toContain('enhanced-mode: fake-ip');
    expect(yaml).toContain('fake-ip-range: 198.18.0.1/16');
    expect(yaml).toContain('listen: 0.0.0.0:1053');
    // Empty optional blocks must not leak as bare keys.
    expect(yaml).not.toContain('nameserver-policy:');
  });
});
