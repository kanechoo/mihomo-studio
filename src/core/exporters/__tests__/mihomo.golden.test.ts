import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { MihomoExporter } from '../mihomo';
import { createDefaultIR } from '../../ir/factory';
import type { MihomoIR, ProxyNode, ProxyProvider } from '../../ir/types';

const exporter = new MihomoExporter();

function golden(name: string) {
  return fileURLToPath(new URL(`./goldens/${name}.yaml`, import.meta.url));
}

function node(partial: Omit<ProxyNode, 'id'>): ProxyNode {
  return { id: 'test-id', ...partial };
}

describe('MihomoExporter golden (characterization)', () => {
  it('exports the default IR as general settings plus the default DNS block', () => {
    const yaml = exporter.export(createDefaultIR());
    expect(yaml).toMatchFileSnapshot(golden('default-ir'));
  });

  it('exports TUN and the optional general keys when they are set', () => {
    const ir = createDefaultIR();
    ir.dns.enable = false;
    ir.general.tun = {
      enable: true,
      stack: 'gvisor',
      'auto-route': true,
      'auto-detect-interface': true,
      'dns-hijack': ['0.0.0.0:53'],
    };
    ir.general['bind-address'] = '*';
    ir.general['external-controller'] = '127.0.0.1:9090';
    ir.general.secret = 'panel-secret';
    expect(exporter.export(ir)).toMatchFileSnapshot(golden('general-tun'));
  });

  it('exports a VLESS Reality node with alpn coercion and stale transport blocks removed', () => {
    const ir = createDefaultIR();
    ir.dns.enable = false;
    ir.proxies = [
      node({
        name: 'vless-reality',
        type: 'vless',
        server: 'example.com',
        port: 443,
        config: {
          uuid: '9d0cb9d0-964f-4ef6-897d-6c6b3ccf9e68',
          flow: 'xtls-rprx-vision',
          udp: true,
          network: 'tcp',
          tls: true,
          'client-fingerprint': 'chrome',
          alpn: 'h2,http/1.1',
          servername: 'example.com',
          'reality-opts': {
            'public-key': 'AdyvjOPWjOFfgFYLfIxLJl9f0E-JYd8ly7wtnWgoNHA',
            'short-id': '0123456789abcdef',
          },
          'skip-cert-verify': false,
          'ws-opts': { path: '/stale-from-an-old-transport' },
        },
      }),
    ];
    expect(exporter.export(ir)).toMatchFileSnapshot(golden('vless-reality'));
  });

  it('exports a modelable XHTTP download-settings block and drops empty nested blocks', () => {
    const ir = createDefaultIR();
    ir.dns.enable = false;
    ir.proxies = [
      node({
        name: 'vless-xhttp-download',
        type: 'vless',
        server: 'upload.example.com',
        port: 443,
        config: {
          uuid: '9d0cb9d0-964f-4ef6-897d-6c6b3ccf9e68',
          udp: true,
          network: 'xhttp',
          tls: true,
          'client-fingerprint': 'chrome',
          servername: 'upload.example.com',
          'xhttp-opts': {
            path: '/',
            host: 'upload.example.com',
            mode: 'auto',
            'download-settings': {
              path: '/dl',
              host: 'dl.example.com',
              'reuse-settings': {
                'max-concurrency': '16-32',
                'h-keep-alive-period': 0,
              },
              server: 'dl.example.com',
              port: 443,
              tls: true,
              'skip-cert-verify': false,
              'reality-opts': {
                'public-key': 'AdyvjOPWjOFfgFYLfIxLJl9f0E-JYd8ly7wtnWgoNHA',
                'short-id': '0123456789abcdef',
              },
              'shadow-tls-opts': {},
              'restls-opts': { password: '' },
            },
          },
        },
      }),
    ];
    expect(exporter.export(ir)).toMatchFileSnapshot(golden('vless-xhttp-download'));
  });

  it('omits a download-settings block whose only value is a REALITY block without a public key', () => {
    const ir = createDefaultIR();
    ir.dns.enable = false;
    ir.proxies = [
      node({
        name: 'vless-xhttp-download-empty',
        type: 'vless',
        server: 'upload.example.com',
        port: 443,
        config: {
          uuid: '9d0cb9d0-964f-4ef6-897d-6c6b3ccf9e68',
          udp: true,
          network: 'xhttp',
          tls: true,
          'xhttp-opts': {
            path: '/',
            mode: 'auto',
            'download-settings': {
              'reality-opts': { 'short-id': '0123456789abcdef' },
            },
          },
        },
      }),
    ];
    expect(exporter.export(ir)).not.toContain('reality-opts');
    expect(exporter.export(ir)).not.toContain('download-settings');
  });

  it('exports Shadowsocks 2022 and quotes a numeric-looking trojan password', () => {
    const ir = createDefaultIR();
    ir.dns.enable = false;
    ir.proxies = [
      node({
        name: 'ss-2022',
        type: 'ss',
        server: 'example.com',
        port: 8388,
        config: {
          cipher: '2022-blake3-aes-256-gcm',
          password: 'vlmpIPSyHH6f4S8WVPdRIHIlzmB+GIRfoH3aNJ/t9Gg=',
          udp: true,
        },
      }),
      node({
        name: 'trojan-num-pw',
        type: 'trojan',
        server: 'example.com',
        port: 443,
        config: { password: '12345678' },
      }),
    ];
    expect(exporter.export(ir)).toMatchFileSnapshot(golden('ss-trojan-passwords'));
  });

  it('exports groups, rules and both provider kinds with unknown provider keys passed through', () => {
    const ir: MihomoIR = {
      ...createDefaultIR(),
      dns: { ...createDefaultIR().dns, enable: false },
      proxies: [
        node({
          name: 'hk-01',
          type: 'hysteria2',
          server: 'hk.example.com',
          port: 443,
          config: { password: 'hy2-pass', sni: 'hk.example.com' },
        }),
        node({
          name: 'jp-tuic',
          type: 'tuic',
          server: 'jp.example.com',
          port: 443,
          config: {
            uuid: '00000000-0000-0000-0000-000000000001',
            password: 'tuic-pass',
            sni: 'jp.example.com',
            'congestion-controller': 'bbr',
          },
        }),
      ],
      proxyProviders: {
        sub1: {
          type: 'http',
          url: 'https://example.com/sub',
          interval: 3600,
          proxy: 'PROXY',
          'size-limit': 0,
          header: { Token: ['abc'] },
          'health-check': {
            enable: true,
            url: 'https://www.gstatic.com/generate_204',
            interval: 300,
            timeout: 5000,
            lazy: true,
          },
          override: { 'additional-prefix': 'p_', 'skip-cert-verify': true },
          filter: '(?i)HK',
          'age-secret-key': 'AGE-SECRET-KEY-1XYZ',
        } as ProxyProvider,
        file1: {
          type: 'file',
          path: './providers/file1.yaml',
          'health-check': { enable: false },
        },
      },
      proxyGroups: [
        {
          id: 'g1',
          name: 'Auto',
          type: 'url-test',
          config: {
            proxies: ['hk-01', 'jp-tuic'],
            use: ['sub1'],
            url: 'https://www.gstatic.com/generate_204',
            interval: 300,
            timeout: 5000,
            tolerance: 50,
            lazy: true,
            strategy: 'consistent-hashing',
          },
        },
        {
          id: 'g2',
          name: 'Pick',
          type: 'select',
          config: { proxies: [], use: ['sub1'] },
        },
      ],
      rules: [
        { id: 'r1', type: 'DOMAIN-SUFFIX', payload: 'google.com', policy: 'Auto' },
        { id: 'r2', type: 'DST-PORT', payload: '443', policy: 'Auto' },
        { id: 'r3', type: 'IP-CIDR', payload: '192.168.0.0/16', policy: 'DIRECT', 'no-resolve': true },
        { id: 'r4', type: 'MATCH', payload: '', policy: 'Auto' },
      ],
      ruleProviders: {
        reject: {
          type: 'http',
          behavior: 'domain',
          format: 'yaml',
          url: 'https://example.com/reject.yaml',
          path: './rules/reject.yaml',
          interval: 86400,
        },
        'lan-file': {
          type: 'file',
          behavior: 'ipcidr',
          path: './rules/lan.ipr',
        },
      },
    };
    expect(exporter.export(ir)).toMatchFileSnapshot(golden('groups-rules-providers'));
  });

  it('omits disabled DNS/TUN and drops empty transport option blocks', () => {
    const ir = createDefaultIR();
    ir.dns.enable = false;
    ir.general['mixed-port'] = 0;
    ir.proxies = [
      node({
        name: 'bare-vless',
        type: 'vless',
        server: 'example.com',
        port: 443,
        config: {
          uuid: '',
          flow: '',
          udp: true,
          network: 'h2',
          tls: false,
          servername: '',
          'skip-cert-verify': false,
          'h2-opts': { host: [], path: '' },
        },
      }),
    ];
    expect(exporter.export(ir)).toMatchFileSnapshot(golden('empty-sections-stripped'));
  });
});

describe('MihomoExporter golden (phase-3 protocols)', () => {
  it('exports the phase-3 protocol batch with UI-only form keys stripped', () => {
    const ir = createDefaultIR();
    ir.dns.enable = false;
    ir.proxies = [
      node({
        name: 'web-hop',
        type: 'http',
        server: 'proxy.example.com',
        port: 8080,
        config: {
          username: 'user',
          password: 'pass',
          tls: true,
          sni: 'proxy.example.com',
          'skip-cert-verify': true,
          'ip-version': 'ipv4',
          'interface-name': 'en0',
          tfo: true,
          mptcp: false,
        },
      }),
      node({
        name: 'socks-home',
        type: 'socks5',
        server: '192.168.1.1',
        port: 1080,
        config: { username: 'u', password: 'p', udp: true },
      }),
      node({
        name: 'vmess-ws',
        type: 'vmess',
        server: 'v.example.com',
        port: 443,
        config: {
          uuid: 'b831381d-6324-4d53-ad4f-8cda48b30811',
          alterId: 0,
          cipher: 'auto',
          udp: true,
          network: 'ws',
          tls: true,
          servername: 'v.example.com',
          'client-fingerprint': 'chrome',
          'ws-opts': { path: '/vmess', headers: { Host: 'v.example.com' } },
        },
      }),
      node({
        name: 'ss-shadowed',
        type: 'ss',
        server: 'ss.example.com',
        port: 443,
        config: {
          cipher: 'chacha20-ietf-poly1305',
          password: 'ss-pass',
          udp: true,
          plugin: 'shadow-tls',
          'client-fingerprint': 'chrome',
          'plugin-opts': {
            host: 'cloud.tencent.com',
            password: 'stls-pass',
            version: 2,
          },
        },
      }),
      node({
        name: 'snell-restls',
        type: 'snell',
        server: 'sn.example.com',
        port: 44046,
        config: {
          psk: 'snell-psk',
          version: 4,
          udp: true,
          reuse: true,
          obfsEnabled: true,
          'obfs-opts': {
            mode: 'restls',
            host: 'bing.com',
            password: 'restls-pass',
            'version-hint': 'tls13',
          },
        },
      }),
      node({
        name: 'ssr-legacy',
        type: 'ssr',
        server: 'r.example.com',
        port: 443,
        config: {
          cipher: 'aes-128-cfb',
          password: 'ssr-pass',
          protocol: 'auth_chain_a',
          obfs: 'tls1.2_ticket_auth',
          'obfs-param': 'r.example.com',
          udp: true,
        },
      }),
      node({
        // The security-layer picker exists only in the form; the exported
        // node must carry the layer block itself and never the picker value.
        name: 'anytls-stls',
        type: 'anytls',
        server: 'a.example.com',
        port: 443,
        config: {
          password: 'at-pass',
          udp: true,
          sni: 'a.example.com',
          anytlsSecurityLayer: 'shadow-tls',
          'shadow-tls-opts': { version: 3, password: 'stls-pass' },
        },
      }),
    ];
    expect(exporter.export(ir)).toMatchFileSnapshot(golden('phase3-protocols'));
  });
});

describe('MihomoExporter golden (phase-4 protocols)', () => {
  it('exports the phase-4 protocol batch', () => {
    const ir = createDefaultIR();
    ir.dns.enable = false;
    ir.proxies = [
      node({
        name: 'hy1',
        type: 'hysteria',
        server: 'h1.example.com',
        port: 443,
        config: {
          'auth-str': 'hunter2',
          protocol: 'faketcp',
          up: '30 Mbps',
          down: '200 Mbps',
          sni: 'h1.example.com',
          alpn: ['h3'],
          'recv-window-conn': 15565824,
          'disable-mtu-discovery': true,
        },
      }),
      node({
        name: 'wg',
        type: 'wireguard',
        server: 'w.example.com',
        port: 51820,
        config: {
          ip: '172.16.0.2',
          ipv6: 'fd01:5ca1:ab1e::2',
          'public-key': 'Cr8hWlKvtDt7nrvf+f0brNQQzabAqrjfBvas9pmowjo=',
          'private-key': 'eCtXsJZ27+4PbhDkHnB923tkUn2Gj59wZw5wFA75MnU=',
          reserved: [209, 98, 59],
          udp: true,
          mtu: 1408,
          'persistent-keepalive': 25,
        },
      }),
      node({
        name: 'ssh-box',
        type: 'ssh',
        server: 's.example.com',
        port: 22,
        config: { username: 'root', password: 'pw' },
      }),
      node({
        name: 'mieru',
        type: 'mieru',
        server: 'm.example.com',
        port: 29990,
        config: {
          username: 'u',
          password: 'p',
          transport: 'UDP',
          multiplexing: 'MULTIPLEXING_HIGH',
          'handshake-mode': 'HANDSHAKE_NO_WAIT',
        },
      }),
      node({
        name: 'sudoku',
        type: 'sudoku',
        server: 'z.example.com',
        port: 443,
        config: {
          key: 'k',
          'aead-method': 'aes-128-gcm',
          'padding-min': 10,
          'padding-max': 50,
          httpmask: { disable: false, mode: 'stream', tls: true, host: 'z.example.com' },
        },
      }),
      node({
        name: 'squic',
        type: 'shadowquic',
        server: 'q.example.com',
        port: 8443,
        config: {
          username: 'u',
          password: 'p',
          sni: 'q.example.com',
          'quic-versions': ['v1'],
          'udp-over-stream': true,
        },
      }),
      node({
        name: 'trust',
        type: 'trusttunnel',
        server: 't.example.com',
        port: 443,
        config: {
          username: 'u',
          password: 'p',
          'health-check': true,
          udp: true,
          quic: false,
          'max-streams': 0,
          sni: 't.example.com',
        },
      }),
      node({
        name: 'gost-dynamic',
        type: 'gost-relay',
        server: 'relay.example.com',
        port: 443,
        config: {
          udp: true,
          tls: true,
          username: 'u',
          password: 'p',
          'client-fingerprint': 'chrome',
        },
      }),
      node({ name: 'dns-out', type: 'dns', config: {} }),
      node({
        name: 'rematch-out',
        type: 'rematch',
        config: { 'target-rematch-name': 'rematch1' },
      }),
    ];
    expect(exporter.export(ir)).toMatchFileSnapshot(golden('phase4-protocols'));
  });
});

describe('MihomoExporter golden (phase-5 VPN protocols)', () => {
  it('exports the phase-5 protocol batch', () => {
    const ir = createDefaultIR();
    ir.dns.enable = false;
    ir.proxies = [
      node({
        name: 'masque-ip',
        type: 'masque',
        server: 'mq.example.com',
        port: 443,
        config: {
          'private-key': 'PK',
          'public-key': 'PB',
          ip: '172.19.0.2',
          ipv6: 'fd01::2',
          mtu: 1400,
          udp: true,
          'ip-stack': { mode: 'gvisor', 'congestion-controller': 'bbr' },
        },
      }),
      node({
        name: 'ts-exit',
        type: 'tailscale',
        config: {
          udp: true,
          hostname: 'edge-1',
          'auth-key': 'tskey-auth-x',
          'exit-node': 'auto:any',
          ephemeral: true,
        },
      }),
      node({
        name: 'zt-net',
        type: 'zerotier',
        config: {
          network: '8056c2e21c24673d',
          udp: true,
          'physical-mtu': 1432,
          orbit: [{ world: '8acf2a9d3b5e7f01', seed: '0000001234' }],
        },
      }),
      node({
        name: 'ovpn',
        type: 'openvpn',
        server: 'o.example.com',
        port: 1194,
        config: {
          proto: 'tcp',
          username: 'u',
          password: 'p',
          cipher: 'AES-256-GCM',
          auth: 'SHA384',
          'data-ciphers': ['AES-256-GCM', 'CHACHA20-POLY1305'],
        },
      }),
    ];
    expect(exporter.export(ir)).toMatchFileSnapshot(golden('phase5-vpn'));
  });
});

describe('MihomoExporter golden (phase-6 field completion)', () => {
  it('exports a fully-loaded VLESS node with ECH, encryption, smux and dial options', () => {
    const ir = createDefaultIR();
    ir.dns.enable = false;
    ir.proxies = [
      node({
        name: 'vless-max',
        type: 'vless',
        server: 'x.example.com',
        port: 443,
        config: {
          uuid: '9d0cb9d0-964f-4ef6-897d-6c6b3ccf9e68',
          encryption: '',
          flow: 'xtls-rprx-vision',
          udp: true,
          network: 'tcp',
          tls: true,
          servername: 'x.example.com',
          'client-fingerprint': 'chrome',
          'name-cert-verify': 'x.example.com',
          alpn: ['h2'],
          'skip-cert-verify': false,
          'reality-opts': {
            'public-key': 'AdyvjOPWjOFfgFYLfIxLJl9f0E-JYd8ly7wtnWgoNHA',
            'short-id': '0123456789abcdef',
            'support-x25519mlkem768': true,
          },
          'ech-opts': { enable: true, config: 'AEn+DQBF', 'query-server-name': 'q.example.com' },
          smux: { enabled: true, protocol: 'smux', padding: true },
          tfo: true,
          mptcp: false,
          'interface-name': 'en1',
          'routing-mark': 6666,
        },
      }),
    ];
    expect(exporter.export(ir)).toMatchFileSnapshot(golden('vless-full'));
  });
});

describe('MihomoExporter golden (phase-7 global sections)', () => {
  it('exports hosts, ntp, profile, experimental, access control and geodata', () => {
    const ir = createDefaultIR();
    ir.dns.enable = false;
    ir.hosts = { '*.mihomo.dev': '127.0.0.1', 'home.lan': 'lan', 'baidu.com': 'google.com' };
    ir.ntp = {
      enable: true,
      server: 'time.apple.com',
      port: 123,
      interval: 30,
      'write-to-system': true,
    };
    ir.profile = { 'store-selected': true };
    ir.experimental = { 'dialer-ip4p-convert': true };
    ir.accessControl = {
      authentication: ['user1:pass1'],
      'skip-auth-prefixes': ['127.0.0.1/8', '::1/128'],
      'lan-allowed-ips': ['0.0.0.0/0', '::/0'],
      'lan-disallowed-ips': ['192.168.0.3/32'],
    };
    ir.geodata = {
      'geodata-mode': true,
      'geodata-loader': 'memconservative',
      'geo-auto-update': true,
      'geo-update-interval': 24,
      'geox-url': { geoip: 'https://example.com/geoip.dat' },
    };
    ir.general['find-process-mode'] = 'off';
    ir.general['tcp-concurrent'] = true;
    ir.general['socks-port'] = 7891;
    expect(exporter.export(ir)).toMatchFileSnapshot(golden('phase7-global'));
  });
});

describe('MihomoExporter golden (phase-8a tun/dns/sniffer)', () => {
  it('exports the full TUN surface, extended DNS and a sniffer section', () => {
    const ir = createDefaultIR();
    ir.general.tun = {
      enable: true,
      stack: 'mixed',
      device: 'utun0',
      mtu: 9000,
      'auto-route': true,
      'auto-redirect': true,
      'auto-detect-interface': true,
      'strict-route': true,
      'dns-hijack': ['any:53'],
      'route-address': ['0.0.0.0/1', '128.0.0.0/1'],
      'exclude-package': ['com.android.captiveportallogin'],
    };
    ir.dns = {
      ...ir.dns,
      enable: true,
      listen: '0.0.0.0:1053',
      'prefer-h3': false,
      'cache-algorithm': 'arc',
      'fake-ip-filter-mode': 'whitelist',
      'use-hosts': true,
      'proxy-server-nameserver': ['https://doh.pub/dns-query'],
      'fallback-lazy-query': true,
    };
    ir.sniffer = {
      enable: true,
      'force-dns-mapping': true,
      'parse-pure-ip': true,
      'override-destination': false,
      sniff: {
        http: { enabled: true, ports: ['80', '8080-8880'], 'override-destination': true },
        tls: { enabled: true },
        'ui-unused': undefined as never,
      } as never,
      'force-domain': ['+.v2ex.com'],
      'skip-domain': ['Mijia Cloud'],
    };
    expect(exporter.export(ir)).toMatchFileSnapshot(golden('phase8-tun-dns-sniffer'));
  });
});

describe('MihomoExporter golden (phase-8b rules/groups)', () => {
  it('exports new rule types with the src param and completed group fields', () => {
    const ir = createDefaultIR();
    ir.dns.enable = false;
    const rid = (i: number) => `r${i}`;
    ir.rules = [
      { id: rid(1), type: 'DOMAIN-WILDCARD', payload: '*.google.com', policy: 'PROXY' },
      { id: rid(2), type: 'IP-ASN', payload: '13335', policy: 'DIRECT', 'no-resolve': true, src: true },
      { id: rid(3), type: 'AND', payload: '((DOMAIN,baidu.com),(NETWORK,UDP))', policy: 'REJECT' },
      { id: rid(4), type: 'IN-TYPE', payload: 'SOCKS/HTTP', policy: 'PROXY' },
      { id: rid(5), type: 'MATCH', payload: '', policy: 'PROXY' },
    ];
    ir.proxyGroups = [
      {
        id: 'g1',
        name: 'auto',
        type: 'url-test',
        config: {
          proxies: ['a'],
          url: 'https://www.gstatic.com/generate_204',
          interval: 300,
          strategy: 'sticky-sessions',
          'expected-status': '200/302',
          'max-failed-times': 3,
          hidden: true,
        },
      },
    ];
    expect(exporter.export(ir)).toMatchFileSnapshot(golden('phase8-rules-groups'));
  });
});

describe('MihomoExporter general inbound ports', () => {
  it('emits standalone inbound ports even when mixed-port is unset', () => {
    const ir = createDefaultIR();
    ir.dns.enable = false;
    delete ir.general['mixed-port'];
    ir.general['port'] = 7890;
    ir.general['socks-port'] = 7891;
    ir.general['redir-port'] = 7892;
    ir.general['tproxy-port'] = 7893;
    const yaml = exporter.export(ir);
    expect(yaml).toContain('port: 7890');
    expect(yaml).toContain('socks-port: 7891');
    expect(yaml).toContain('redir-port: 7892');
    expect(yaml).toContain('tproxy-port: 7893');
    expect(yaml).not.toContain('mixed-port:');
  });

  it('emits mixed-port alongside the other inbound ports', () => {
    const ir = createDefaultIR();
    ir.dns.enable = false;
    ir.general['mixed-port'] = 7890;
    ir.general['socks-port'] = 7891;
    const yaml = exporter.export(ir);
    expect(yaml).toContain('mixed-port: 7890');
    expect(yaml).toContain('socks-port: 7891');
  });
});
