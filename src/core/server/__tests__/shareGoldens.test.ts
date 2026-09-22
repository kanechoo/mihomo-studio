import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { importServerYaml } from '../importers/serverYaml';
import { deriveRealityPublicKey } from '../../shared/generators/reality';
import { generateProxyShare, shareableUsers } from '../share';
import { dumpProxiesYaml } from '../share/common';
import type { ListenerIR, UserEntry } from '../types';

// ============= Golden fixtures =============
//
// One directory per convertible protocol holding a real `listeners:` server
// document and the client `proxies:` fragment sharing must produce for it.
// When mihomo grows fields, updating the fixture forces the mapping through
// review instead of letting it drift silently.

function fixtureDir(protocol: string) {
  return fileURLToPath(new URL(`./testdata/${protocol}`, import.meta.url));
}

// The editor derives and stores the REALITY public half whenever the private
// half is written; imports go through that same write path before sharing.
function withEditorDerivedKeys(listener: ListenerIR): ListenerIR {
  const reality = listener.tls.reality;
  if (reality?.privateKey && !reality.publicKey) {
    reality.publicKey = deriveRealityPublicKey(reality.privateKey);
  }
  return listener;
}

// What the share modal does across its rows: one node per identity on
// multi-user protocols, one otherwise, all collected under a single
// `proxies:` key.
function shareDocument(listener: ListenerIR, host: string): string {
  const identities: (UserEntry | undefined)[] =
    shareableUsers(listener).length > 0 ? shareableUsers(listener) : [undefined];
  const nodes = identities.map(
    (user) =>
      (
        yaml.load(generateProxyShare(listener, host, user).yaml!) as Record<string, any>
      ).proxies[0]
  );
  return dumpProxiesYaml(nodes);
}

const PROTOCOLS = [
  'vless',
  'vmess',
  'trojan',
  'shadowsocks',
  'tuic',
  'hysteria2',
  'anytls',
  'snell',
  'mieru',
  'sudoku',
  'shadowquic',
  'trusttunnel',
] as const;

describe('listener → proxy share goldens', () => {
  for (const protocol of PROTOCOLS) {
    it(`converts ${protocol} exactly like the committed fixture`, async () => {
      const serverYaml = readFileSync(fixtureDir(`${protocol}/server.yaml`), 'utf8');
      const result = importServerYaml(serverYaml);
      expect(result.problems.filter((p) => p.severity === 'error')).toEqual([]);

      // `servers` is profile metadata the importer preserves verbatim on the
      // document; read it straight from the source YAML.
      const rawDocument = yaml.load(serverYaml) as Record<string, any>;
      const host = (rawDocument.servers ?? [])[0];
      expect(host).toBeTruthy();

      const listener = withEditorDerivedKeys(result.config!.listeners[0]);
      await expect(shareDocument(listener, host)).toMatchFileSnapshot(
        fixtureDir(`${protocol}/expected.yaml`)
      );
    });
  }
});

// ============= Field coverage audit =============
//
// Every documented server-listener key of each fixture protocol, and the set
// of client keys the converter is allowed to emit. An input key outside the
// first table means a new upstream field reached the converter unreviewed; an
// output key outside the second means something was renamed or invented
// without updating this matrix. Both are failures by design.

type Matrix = Record<string, { server: string[]; client: string[] }>;

const COMMON_SERVER_KEYS = ['name', 'type', 'port', 'listen', 'routing-mark', 'rule', 'proxy'];

const MATRIX: Matrix = {
  vless: {
    server: [
      ...COMMON_SERVER_KEYS,
      'users',
      'ws-path',
      'grpc-service-name',
      'xhttp-config',
      'decryption',
      'certificate',
      'private-key',
      'client-auth-type',
      'client-auth-cert',
      'ech-key',
      'reality-config',
      'shadow-tls',
      'res-tls',
      'jls-config',
      'allow-insecure',
      'mux-option',
    ],
    client: [
      'name',
      'type',
      'server',
      'port',
      'uuid',
      'flow',
      'network',
      'ws-opts',
      'grpc-opts',
      'xhttp-opts',
      'tls',
      'servername',
      'client-fingerprint',
      'reality-opts',
      'shadow-tls-opts',
      'restls-opts',
      'jls-opts',
      'smux',
    ],
  },
  vmess: {
    server: [
      ...COMMON_SERVER_KEYS,
      'users',
      'ws-path',
      'grpc-service-name',
      'mekya-config',
      'mkcp-config',
      'certificate',
      'private-key',
      'client-auth-type',
      'client-auth-cert',
      'ech-key',
      'jls-config',
      'shadow-tls',
      'res-tls',
      'reality-config',
      'tlsmirror-config',
      'mux-option',
    ],
    client: [
      'name',
      'type',
      'server',
      'port',
      'uuid',
      'alterId',
      'cipher',
      'network',
      'ws-opts',
      'grpc-opts',
      'mkcp-opts',
      'tls',
      'servername',
      'reality-opts',
      'shadow-tls-opts',
      'restls-opts',
      'jls-opts',
      'tlsmirror-opts',
      'client-fingerprint',
      'smux',
    ],
  },
  trojan: {
    server: [
      ...COMMON_SERVER_KEYS,
      'users',
      'ws-path',
      'grpc-service-name',
      'certificate',
      'private-key',
      'client-auth-type',
      'client-auth-cert',
      'ech-key',
      'shadow-tls',
      'res-tls',
      'jls-config',
      'reality-config',
      'ss-option',
      'allow-insecure',
      'mux-option',
    ],
    client: [
      'name',
      'type',
      'server',
      'port',
      'password',
      'network',
      'ws-opts',
      'grpc-opts',
      'sni',
      'client-fingerprint',
      'reality-opts',
      'shadow-tls-opts',
      'restls-opts',
      'jls-opts',
      'ss-opts',
      'smux',
    ],
  },
  shadowsocks: {
    server: [
      ...COMMON_SERVER_KEYS,
      'cipher',
      'password',
      'udp',
      'simple-obfs',
      'shadow-tls',
      'res-tls',
      'jls-config',
      'kcp-tun',
      'mux-option',
    ],
    client: [
      'name',
      'type',
      'server',
      'port',
      'cipher',
      'password',
      'udp',
      'plugin',
      'plugin-opts',
    ],
  },
  tuic: {
    server: [
      ...COMMON_SERVER_KEYS,
      'users',
      'token',
      'certificate',
      'private-key',
      'client-auth-type',
      'client-auth-cert',
      'ech-key',
      'congestion-controller',
      'bbr-profile',
      'max-idle-time',
      'authentication-timeout',
      'alpn',
      'max-udp-relay-packet-size',
      'mux-option',
    ],
    client: [
      'name',
      'type',
      'server',
      'port',
      'uuid',
      'password',
      'token',
      'congestion-controller',
      'bbr-profile',
      'alpn',
      'max-udp-relay-packet-size',
      'sni',
    ],
  },
  hysteria2: {
    server: [
      ...COMMON_SERVER_KEYS,
      'users',
      'up',
      'down',
      'ignore-client-bandwidth',
      'obfs',
      'obfs-password',
      'masquerade',
      'bbr-profile',
      'realm-opts',
      'alpn',
      'certificate',
      'private-key',
      'client-auth-type',
      'client-auth-cert',
      'ech-key',
      'mux-option',
    ],
    client: [
      'name',
      'type',
      'server',
      'port',
      'ports',
      'password',
      'up',
      'down',
      'obfs',
      'obfs-password',
      'bbr-profile',
      'alpn',
      'realm-opts',
      'sni',
    ],
  },
  anytls: {
    server: [
      ...COMMON_SERVER_KEYS,
      'users',
      'certificate',
      'private-key',
      'client-auth-type',
      'client-auth-cert',
      'ech-key',
      'shadow-tls',
      'res-tls',
      'jls-config',
      'allow-insecure',
      'padding-scheme',
    ],
    client: [
      'name',
      'type',
      'server',
      'port',
      'password',
      'sni',
      'padding-scheme',
      'shadow-tls-opts',
      'restls-opts',
      'jls-opts',
    ],
  },
  snell: {
    server: [
      ...COMMON_SERVER_KEYS,
      'psk',
      'version',
      'udp',
      'obfs-opts',
      'shadow-tls',
      'res-tls',
      'jls-config',
    ],
    client: [
      'name',
      'type',
      'server',
      'port',
      'psk',
      'version',
      'udp',
      'obfs-opts',
    ],
  },
  mieru: {
    server: [...COMMON_SERVER_KEYS, 'transport', 'users', 'traffic-pattern', 'user-hint-is-mandatory'],
    client: ['name', 'type', 'server', 'port', 'username', 'password', 'transport', 'traffic-pattern'],
  },
  sudoku: {
    server: [
      ...COMMON_SERVER_KEYS,
      'key',
      'aead-method',
      'padding-min',
      'padding-max',
      'table-type',
      'custom-table',
      'custom-tables',
      'handshake-timeout',
      'enable-pure-downlink',
      'httpmask',
      'fallback',
      'disable-http-mask',
      'http-mask-mode',
      'path-root',
      'mux-option',
    ],
    client: [
      'name',
      'type',
      'server',
      'port',
      'key',
      'aead-method',
      'padding-min',
      'padding-max',
      'table-type',
      'custom-table',
      'custom-tables',
      'httpmask',
      'enable-pure-downlink',
    ],
  },
  shadowquic: {
    server: [
      ...COMMON_SERVER_KEYS,
      'users',
      'jls-upstream',
      'alpn',
      'quic-versions',
      'zero-rtt',
      'congestion-controller',
      'up',
      'down',
      'ignore-client-bandwidth',
      'cwnd',
      'bbr-profile',
      'max-idle-time',
      'max-datagram-frame-size',
      'recv-window-conn',
      'recv-window',
      'disable-mtu-discovery',
    ],
    client: [
      'name',
      'type',
      'server',
      'port',
      'username',
      'password',
      'alpn',
      'quic-versions',
      'zero-rtt',
      'congestion-controller',
      'up',
      'down',
      'cwnd',
      'bbr-profile',
      'max-datagram-frame-size',
      'recv-window-conn',
      'recv-window',
      'disable-mtu-discovery',
    ],
  },
  trusttunnel: {
    server: [
      ...COMMON_SERVER_KEYS,
      'users',
      'certificate',
      'private-key',
      'network',
      'congestion-controller',
      'bbr-profile',
      'client-auth-type',
      'client-auth-cert',
      'ech-key',
    ],
    client: [
      'name',
      'type',
      'server',
      'port',
      'username',
      'password',
      'quic',
      'udp',
      'congestion-controller',
      'bbr-profile',
      'sni',
    ],
  },
};

describe('field coverage audit', () => {
  for (const protocol of PROTOCOLS) {
    it(`accounts for every ${protocol} server key and emitted client key`, () => {
      const matrix = MATRIX[protocol];
      const rawListener = (
        yaml.load(readFileSync(fixtureDir(`${protocol}/server.yaml`), 'utf8')) as Record<string, any>
      ).listeners[0];
      const inputKeys = Object.keys(rawListener);

      const unknownServerKeys = inputKeys.filter((key) => !matrix.server.includes(key));
      expect(unknownServerKeys).toEqual([]);

      const result = importServerYaml(
        readFileSync(fixtureDir(`${protocol}/server.yaml`), 'utf8')
      );
      const listener = withEditorDerivedKeys(result.config!.listeners[0]);
      const document = yaml.load(shareDocument(listener, 'example.com')) as Record<string, any>;

      // Top-level keys only: nested blocks carry their own audits (see the
      // xhttp one below).
      const emittedKeys = new Set<string>();
      for (const node of document.proxies) {
        for (const key of Object.keys(node)) emittedKeys.add(key);
      }
      const unknownClientKeys = Array.from(emittedKeys).filter(
        (key) => !matrix.client.includes(key)
      );
      expect(unknownClientKeys).toEqual([]);
    });
  }

  it('audits the dense xhttp-config block field by field', () => {
    const serverXhttp = Object.keys(
      (
        yaml.load(readFileSync(fixtureDir('vless/server.yaml'), 'utf8')) as Record<string, any>
      ).listeners[0]['xhttp-config']
    );
    const SERVER_XHTTP_KEYS = [
      'path',
      'host',
      'mode',
      'no-sse-header',
      'x-padding-bytes',
      'x-padding-obfs-mode',
      'x-padding-key',
      'x-padding-header',
      'x-padding-placement',
      'x-padding-method',
      'uplink-http-method',
      'session-placement',
      'session-key',
      'session-table',
      'session-length',
      'seq-placement',
      'seq-key',
      'uplink-data-placement',
      'uplink-data-key',
      'uplink-chunk-size',
      'sc-max-buffered-posts',
      'sc-stream-up-server-secs',
      'sc-max-each-post-bytes',
    ];
    expect(serverXhttp.filter((key) => !SERVER_XHTTP_KEYS.includes(key))).toEqual([]);

    const document = yaml.load(shareDocument(withEditorDerivedKeys(
      importServerYaml(readFileSync(fixtureDir('vless/server.yaml'), 'utf8')).config!.listeners[0]
    ), 'example.com')) as Record<string, any>;
    const emitted = Object.keys(document.proxies[0]['xhttp-opts']);
    const CLIENT_XHTTP_KEYS = [
      'path',
      'host',
      'mode',
      'x-padding-bytes',
      'x-padding-obfs-mode',
      'x-padding-key',
      'x-padding-header',
      'x-padding-placement',
      'x-padding-method',
      'uplink-http-method',
      'session-placement',
      'session-key',
      'session-table',
      'session-length',
      'seq-placement',
      'seq-key',
      'uplink-data-placement',
      'uplink-data-key',
      'uplink-chunk-size',
      'sc-max-each-post-bytes',
    ];
    expect(emitted.filter((key) => !CLIENT_XHTTP_KEYS.includes(key))).toEqual([]);
  });
});
