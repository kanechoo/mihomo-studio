import { describe, it, expect } from 'vitest';
import { MihomoYAMLImporter } from '../mihomo';
import type { MihomoIR } from '../../ir/types';

const importer = new MihomoYAMLImporter();

function stripIds(ir: MihomoIR) {
  return {
    ...ir,
    proxies: ir.proxies.map(({ id: _id, ...rest }) => rest),
    proxyGroups: ir.proxyGroups.map(({ id: _id, ...rest }) => rest),
    rules: ir.rules.map(({ id: _id, ...rest }) => rest),
  };
}

const RICH_YAML = `
mode: global
mixed-port: 7891
allow-lan: true
log-level: warning
ipv6: true
external-controller: 127.0.0.1:9090
secret: panel-secret
tun:
  enable: true
  stack: gvisor
  dns-hijack:
    - 0.0.0.0:53
  auto-route: true
  auto-detect-interface: true
dns:
  enable: true
  ipv6: true
  enhanced-mode: redir-host
  nameserver:
    - https://doh.pub/dns-query
  nameserver-policy:
    '+.cn': https://dns.alidns.com/dns-query
proxies:
  - name: vless-1
    type: vless
    server: example.com
    port: 443
    uuid: u-123
    flow: xtls-rprx-vision
    tls: true
    servername: example.com
    reality-opts:
      public-key: pbk-value
      short-id: abcd
    some-future-key: keep-me
  - type: trojan
    server: broken.example.com
proxy-groups:
  - name: G
    type: select
    proxies:
      - vless-1
    use: solo-provider
    custom-extra: preserved
rules:
  - DOMAIN-SUFFIX,google.com,G
  - MATCH,DIRECT
  - IP-CIDR,10.0.0.0/8,DIRECT,no-resolve
rule-providers:
  rp:
    type: http
    behavior: domain
    format: yaml
    url: https://example.com/r.yaml
    path: ./rules/r.yaml
    interval: 86400
listeners:
  - name: from-the-future
    type: socks
`;

describe('MihomoYAMLImporter canImport', () => {
  it('accepts YAML mappings', () => {
    expect(importer.canImport(RICH_YAML)).toBe(true);
    expect(importer.canImport('mode: rule')).toBe(true);
  });

  it('rejects non-mapping or invalid content', () => {
    expect(importer.canImport('42')).toBe(false);
    expect(importer.canImport('')).toBe(false);
    expect(importer.canImport('not: [valid')).toBe(false);
  });
});

describe('MihomoYAMLImporter golden (characterization)', () => {
  it('imports a full document into the expected IR shape', async () => {
    const result = await importer.import(RICH_YAML);
    expect(result.success).toBe(true);

    expect(stripIds(result.ir!)).toEqual({
      version: '1.0.0',
      general: {
        mode: 'global',
        'mixed-port': 7891,
        'allow-lan': true,
        'log-level': 'warning',
        ipv6: true,
        'external-controller': '127.0.0.1:9090',
        secret: 'panel-secret',
        tun: {
          enable: true,
          stack: 'gvisor',
          'dns-hijack': ['0.0.0.0:53'],
          'auto-route': true,
          'auto-detect-interface': true,
        },
      },
      dns: {
        enable: true,
        ipv6: true,
        'enhanced-mode': 'redir-host',
        nameserver: ['https://doh.pub/dns-query'],
        'nameserver-policy': { '+.cn': 'https://dns.alidns.com/dns-query' },
      },
      proxies: [
        {
          name: 'vless-1',
          type: 'vless',
          server: 'example.com',
          port: 443,
          config: {
            uuid: 'u-123',
            flow: 'xtls-rprx-vision',
            tls: true,
            servername: 'example.com',
            'reality-opts': { 'public-key': 'pbk-value', 'short-id': 'abcd' },
            'some-future-key': 'keep-me',
          },
        },
      ],
      proxyProviders: {},
      proxyGroups: [
        {
          name: 'G',
          type: 'select',
          config: {
            proxies: ['vless-1'],
            use: ['solo-provider'],
            url: undefined,
            interval: undefined,
            tolerance: undefined,
            lazy: undefined,
            'disable-udp': undefined,
            filter: undefined,
            'exclude-filter': undefined,
            strategy: undefined,
            'custom-extra': 'preserved',
          },
        },
      ],
      rules: [
        { type: 'DOMAIN-SUFFIX', payload: 'google.com', policy: 'G', 'no-resolve': false },
        { type: 'MATCH', payload: '', policy: 'DIRECT' },
        {
          type: 'IP-CIDR',
          payload: '10.0.0.0/8',
          policy: 'DIRECT',
          'no-resolve': true,
        },
      ],
      ruleProviders: {
        rp: {
          type: 'http',
          behavior: 'domain',
          format: 'yaml',
          url: 'https://example.com/r.yaml',
          path: './rules/r.yaml',
          interval: 86400,
        },
      },
      extensions: {
        listeners: [{ name: 'from-the-future', type: 'socks' }],
      },
    });

    expect(result.errors).toBeUndefined();
    expect(result.warnings).toEqual([
        'Proxies: proxy #2: no name',
        'Unknown sections preserved as-is: listeners',
      ]);
  });

  it('preserves unknown top-level sections in extensions with a warning', async () => {
    // RICH_YAML itself ends with a listeners section this editor does not
    // model — exactly the from-the-future shape the channel exists for.
    const result = await importer.import(RICH_YAML);
    expect(result.ir?.extensions).toBeDefined();
    expect(result.ir?.extensions?.listeners).toEqual([
      { name: 'from-the-future', type: 'socks' },
    ]);
    const allMessages = [...(result.warnings ?? []), ...(result.errors ?? [])].join('\n');
    expect(allMessages).toContain('listeners');
  });

  it('round-trips unknown sections byte-stably through extensions', async () => {
    const tail = [
      'tunnels:',
      '  - network: [tcp, udp]',
      '    address: 127.0.0.1:7777',
      '    target: target.com',
      '    proxy: proxy',
      'script:',
      '  code: "function onLog()"',
    ].join('\n');
    // A standalone document whose unknown sections must survive untouched.
    const head = ['mode: rule', 'proxies:', '  - name: d', '    type: direct'].join('\n');
    const doc = head + '\n' + tail + '\n';
    const first = await importer.import(doc);
    expect(first.ir).toBeDefined();
    const reexported = new (await import('../../exporters/mihomo')).MihomoExporter().export(first.ir!);
        expect(reexported.startsWith(head)).toBe(true);
    // Formatting normalises (flow styles, quotes) but the data must be
    // verbatim, and the preserved sections must come after every known one.
    const reparsed = await importer.import(reexported);
    expect(reparsed.ir?.extensions).toEqual(first.ir?.extensions);
    expect(Object.keys(JSON.parse(JSON.stringify(first.ir!.extensions!)))).toEqual([
      'tunnels',
      'script',
    ]);
    for (const k of ['mixed-port', 'mode', 'proxies']) {
      expect(reexported.indexOf(k)).toBeLessThan(reexported.indexOf('tunnels:'));
    }  });

  it('falls back to defaults for a nearly empty document', async () => {
    const result = await importer.import('mode: rule\n');
    expect(result.success).toBe(true);
    expect(result.ir!.general.mode).toBe('rule');
    // A plain document must not grow an extensions key.
    expect(result.ir!.extensions).toBeUndefined();
  });

  it('reports failure for unparseable YAML', async () => {
    const result = await importer.import('not: [valid');
    expect(result.success).toBe(false);
    expect(result.ir).toBeUndefined();
    expect(result.errors?.length).toBeGreaterThan(0);
  });
});

describe('MihomoYAMLImporter phase-3 protocols', () => {
  it('round-trips the exported phase-3 fixture byte-for-byte', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const path = fileURLToPath(new URL('../../exporters/__tests__/goldens/phase3-protocols.yaml', import.meta.url));
    const yaml = readFileSync(path, 'utf8');

    const first = await importer.import(yaml);
    expect(first.errors ?? []).toEqual([]);
    expect(first.ir).toBeDefined();
    const reexported = new (await import('../../exporters/mihomo')).MihomoExporter().export(
      first.ir!
    );
    // Import must not lose or rename anything this app just exported.
    expect(reexported).toBe(yaml);
  });
});

describe('MihomoYAMLImporter phase-4 protocols', () => {
  it('round-trips the exported phase-4 fixture byte-for-byte', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const path = fileURLToPath(new URL('../../exporters/__tests__/goldens/phase4-protocols.yaml', import.meta.url));
    const yaml = readFileSync(path, 'utf8');

    const first = await importer.import(yaml);
    expect(first.errors ?? []).toEqual([]);
    expect(first.ir).toBeDefined();
    const reexported = new (await import('../../exporters/mihomo')).MihomoExporter().export(
      first.ir!
    );
    expect(reexported).toBe(yaml);
  });
});

describe('MihomoYAMLImporter vless xhttp download-settings', () => {
  it('round-trips the exported download-settings fixture byte-for-byte', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const path = fileURLToPath(
      new URL('../../exporters/__tests__/goldens/vless-xhttp-download.yaml', import.meta.url)
    );
    const yaml = readFileSync(path, 'utf8');

    const first = await importer.import(yaml);
    expect(first.errors ?? []).toEqual([]);
    expect(first.ir).toBeDefined();

    const download = first.ir!.proxies[0].config['xhttp-opts']['download-settings'];
    expect(download['skip-cert-verify']).toBe(false);
    expect(download['reuse-settings']['h-keep-alive-period']).toBe(0);
    expect(download['reality-opts']['public-key']).toBe(
      'AdyvjOPWjOFfgFYLfIxLJl9f0E-JYd8ly7wtnWgoNHA'
    );

    const reexported = new (await import('../../exporters/mihomo')).MihomoExporter().export(
      first.ir!
    );
    expect(reexported).toBe(yaml);
  });
});

describe('MihomoYAMLImporter phase-5 protocols', () => {
  it('round-trips the exported phase-5 fixture byte-for-byte', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const path = fileURLToPath(new URL('../../exporters/__tests__/goldens/phase5-vpn.yaml', import.meta.url));
    const yaml = readFileSync(path, 'utf8');

    const first = await importer.import(yaml);
    expect(first.errors ?? []).toEqual([]);
    expect(first.ir).toBeDefined();
    const reexported = new (await import('../../exporters/mihomo')).MihomoExporter().export(
      first.ir!
    );
    expect(reexported).toBe(yaml);
  });
});

describe('MihomoYAMLImporter phase-7 global sections', () => {
  it('round-trips the exported phase-7 fixture byte-for-byte', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const path = fileURLToPath(new URL('../../exporters/__tests__/goldens/phase7-global.yaml', import.meta.url));
    const yaml = readFileSync(path, 'utf8');

    const first = await importer.import(yaml);
    expect(first.errors ?? []).toEqual([]);
    expect(first.ir).toBeDefined();
    expect(first.ir!.hosts).toMatchObject({ 'home.lan': 'lan' });
    expect(first.ir!.ntp?.enable).toBe(true);
    expect(first.ir!.accessControl?.authentication).toEqual(['user1:pass1']);
    expect(first.ir!.geodata?.['geodata-mode']).toBe(true);
    const reexported = new (await import('../../exporters/mihomo')).MihomoExporter().export(
      first.ir!
    );
    expect(reexported).toBe(yaml);
  });
});

describe('MihomoYAMLImporter phase-8 sections', () => {
  it('round-trips the exported phase-8 fixture byte-for-byte', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const path = fileURLToPath(new URL('../../exporters/__tests__/goldens/phase8-tun-dns-sniffer.yaml', import.meta.url));
    const yaml = readFileSync(path, 'utf8');

    const first = await importer.import(yaml);
    expect(first.errors ?? []).toEqual([]);
    expect(first.ir).toBeDefined();
    expect(first.ir!.general.tun?.device).toBe('utun0');
    expect(first.ir!.dns['cache-algorithm']).toBe('arc');
    expect(first.ir!.sniffer?.enable).toBe(true);
    expect(Object.keys(first.ir!.sniffer!.sniff!)).toEqual(['http', 'tls']);
    const reexported = new (await import('../../exporters/mihomo')).MihomoExporter().export(
      first.ir!
    );
    expect(reexported).toBe(yaml);
  });
});

describe('MihomoYAMLImporter phase-8b rules/groups', () => {
  it('round-trips the exported phase-8b fixture byte-for-byte', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const path = fileURLToPath(new URL('../../exporters/__tests__/goldens/phase8-rules-groups.yaml', import.meta.url));
    const yaml = readFileSync(path, 'utf8');

    const first = await importer.import(yaml);
    expect(first.errors ?? []).toEqual([]);
    expect(first.ir).toBeDefined();
    const reexported = new (await import('../../exporters/mihomo')).MihomoExporter().export(
      first.ir!
    );
    expect(reexported).toBe(yaml);
  });
});
