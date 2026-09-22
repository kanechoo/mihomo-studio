import { describe, it, expect } from 'vitest';
import { ServerYamlExporter } from '../exporters/serverYaml';
import { importServerYaml } from '../importers/serverYaml';
import { createListener, createDefaultServerConfig } from '../factory';
import type { ListenerIR, ServerConfigIR } from '../types';

const exporter = new ServerYamlExporter();

function roundtrip(config: ServerConfigIR) {
  const first = exporter.export(config);
  const imported = importServerYaml(first);
  expect(imported.config).toBeDefined();
  const second = exporter.export(imported.config!);
  return { first, second, imported };
}

describe('server YAML importer', () => {
  it('reports invalid YAML and non-mapping documents', () => {
    expect(importServerYaml('a: [b').problems[0].code).toBe(
      'server.import.yamlInvalid'
    );
    expect(importServerYaml('42').problems[0].code).toBe('server.import.notMapping');
  });

  it('notes missing listeners and ignored top-level keys', () => {
    const result = importServerYaml('mode: rule\nsome-future-key: true\ndns:\n  enable: true\n');
    expect(result.config?.listeners).toEqual([]);
    expect(result.config?.general.mode).toBe('rule');
    const codes = result.problems.map((p) => p.code);
    expect(codes).toContain('server.import.noListeners');
    expect(codes).toContain('server.import.topLevelIgnored');
  });

  it('detects TUIC version from token vs users and preserves map auth', () => {
    const yaml = [
      'listeners:',
      '  - name: t4',
      '    type: tuic',
      "    port: '10003'",
      '    token:',
      '      - SECRET',
      '  - name: t5',
      '    type: tuic',
      "    port: '10004'",
      '    users:',
      '      uuid-1: pwd',
    ].join('\n');
    const result = importServerYaml(yaml);
    const [t4, t5] = result.config!.listeners;
    expect(t4.tuicVersion).toBe('v4');
    expect(t4.auth.mode).toBe('token');
    expect(t5.tuicVersion).toBe('v5');
    expect(t5.auth.mode).toBe('map');
    expect(t5.auth.users[0]).toEqual({ username: 'uuid-1', password: 'pwd' });
  });

  it('routes unknown listener keys into extensions with an info problem', () => {
    const yaml = [
      'listeners:',
      '  - name: future-socks',
      '    type: socks',
      "    port: '1080'",
      '    brand-new-option: keep-me',
    ].join('\n');
    const result = importServerYaml(yaml);
    const listener = result.config!.listeners[0];
    expect(listener.extensions).toEqual({ 'brand-new-option': 'keep-me' });
    expect(result.problems.some((p) => p.code === 'server.import.extensionsPreserved')).toBe(
      true
    );
  });

  it('parses dns block into the shared kebab-case IR', () => {
    const yaml = ['dns:', '  enable: true', '  enhanced-mode: fake-ip', '  fake-ip-range: 198.18.0.1/16'].join('\n');
    const result = importServerYaml(yaml);
    expect(result.config!.dns).toMatchObject({
      enable: true,
      'enhanced-mode': 'fake-ip',
      'fake-ip-range': '198.18.0.1/16',
    });
  });

  it('keeps every documented dns key through a round-trip, including nested maps', () => {
    const source = [
      'dns:',
      '  enable: true',
      '  ipv6: true',
      '  prefer-h3: true',
      '  nameserver:',
      '    - https://doh.pub/dns-query',
      '  fallback: 8.8.8.8',
      '  nameserver-policy:',
      '    geosite:cn: https://doh.pub/dns-query',
      "  fallback-filter:",
      '    geoip: true',
      '    geoip-code: CN',
    ].join('\n');
    const imported = importServerYaml(source);
    const exported = exporter.export(imported.config!);
    expect(exported).toContain('prefer-h3: true');
    // A bare-string list is tolerated on import and written back as a list.
    expect(exported).toContain('- 8.8.8.8');
    expect(exported).toContain('nameserver-policy:');
    expect(exported).toContain('geosite:cn: https://doh.pub/dns-query');
    expect(exported).toContain('geoip-code: CN');

    const again = importServerYaml(exported);
    expect(exporter.export(again.config!)).toBe(exported);
  });

  it('classifies path-like certificate values as source=path', () => {
    const yaml = [
      'listeners:',
      '  - name: h',
      '    type: http',
      "    port: '80'",
      '    certificate: /etc/ssl/c.pem',
      '    private-key: ./k.pem',
    ].join('\n');
    const l = importServerYaml(yaml).config!.listeners[0];
    expect(l.tls.mode).toBe('tls');
    expect(l.tls.certificate).toEqual({ source: 'path', value: '/etc/ssl/c.pem' });
  });
});

describe('round-trip (export → import → export)', () => {
  it('is idempotent for a representative multi-protocol config', () => {
    const socks = createListener('socks');
    socks.name = 's1';
    socks.auth = { mode: 'list', token: [], users: [{ username: 'u', password: 'p' }] };
    socks.tls = {
      mode: 'tls',
      certificate: { source: 'path', value: './c.pem' },
      privateKey: { source: 'path', value: './k.pem' },
      clientAuthType: 'require-and-verify',
      clientAuthCert: { source: 'path', value: './ca.pem' },
    };

    const vless = createListener('vless');
    vless.name = 'vl-reality';
        vless.auth = { mode: 'list', token: [], users: [{ username: '', uuid: 'u1', flow: '' }] };
    vless.tls = {
      mode: 'reality',
      reality: {
        dest: 'test.com:443',
        privateKey: 'rk',
        shortIds: ['01'],
        serverNames: ['test.com'],
        limitFallbackUpload: { afterBytes: 0, bytesPerSec: 10 },
      },
    };

    const ss = createListener('shadowsocks');
    ss.name = 'ss2022';
    ss.protocol.cipher = '2022-blake3-aes-256-gcm';
    ss.protocol.password = 'AAAA';

    const tun = createListener('tun');

    const config = createDefaultServerConfig();
    config.listeners = [socks, vless, ss, tun];

    const { first, second } = roundtrip(config);
    expect(second).toBe(first);
  });

  it('preserves unknown extensions verbatim across a round-trip', () => {
    const config = createDefaultServerConfig();
    const socks = createListener('socks');
    socks.extensions = { 'future-key': { nested: [1, 2] } };
    config.listeners.push(socks);
    const { first, imported, second } = roundtrip(config);
    expect(second).toBe(first);
    // And the preserved block must come back through the importer too, not
    // merely survive the exporter.
    // The importer keeps the document's original spelling — mangling an
    // unknown key's case is not this app's business.
    expect(imported.config?.listeners[0]?.extensions).toEqual({
      'future-key': { nested: [1, 2] },
    });
  });

  it('keeps per-listener semantic equality for shadow-tls v3 users', () => {
    const trojan = createListener('trojan');
    trojan.security.shadowTls = {
      enable: true,
      version: 3,
      users: [{ name: 'n1', password: 'p1' }],
      handshake: { dest: 'dest.com:443' },
    };
    const imported = importServerYaml(exporter.export({ ...createDefaultServerConfig(), listeners: [trojan] }));
    const back = imported.config!.listeners[0].security.shadowTls!;
    expect(back.enable).toBe(true);
    expect(back.version).toBe(3);
    expect(back.users).toEqual([{ name: 'n1', password: 'p1' }]);
    expect(back.handshake.dest).toBe('dest.com:443');
  });

  it('survives empty configs (all listeners disabled, dns off)', () => {
    const config = createDefaultServerConfig();
    const l = createListener('http');
    l.enabled = false;
    config.listeners = [l];
    // With no listeners or dns, only the general frame remains — never `{}`.
    const yaml = exporter.export(config);
    expect(yaml).toContain('mode: rule');
    expect(yaml).not.toContain('listeners:');
    expect(yaml).not.toContain('dns:');
    const result = importServerYaml(yaml);
    expect(result.config?.listeners ?? []).toHaveLength(0);
    expect(result.config?.general.mode).toBe('rule');
  });

  it('re-imports every current factory default without errors', () => {
    const kinds = [
      'http','socks','mixed','redir','tproxy','shadowsocks','vmess','vless',
      'trojan','anytls','snell','mieru','sudoku','trusttunnel','shadowquic',
      'hysteria2','hysteria2-realm','tunnel',
    ] as const;
    const listeners: ListenerIR[] = kinds.map((kind) =>
      createListener(kind)
    );
    const v4 = createListener('tuic', 'v4');
    const v5 = createListener('tuic', 'v5');
    const tun = createListener('tun');
    const config = createDefaultServerConfig();
    config.listeners = [...listeners, v4, v5, tun];

    const first = exporter.export(config);
    const imported = importServerYaml(first);
    expect(imported.problems.filter((p) => p.severity === 'error')).toHaveLength(0);
    expect(exporter.export(imported.config!)).toBe(first);
  });
});
