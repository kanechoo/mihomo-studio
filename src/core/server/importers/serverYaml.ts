import yaml from 'js-yaml';
import { generateId } from '../../ir/factory';
import type {
  AuthSection,
  ListenerIR,
  ListenerKind,
  SecurityBlocks,
  ServerConfigIR,
  ServerDnsIR,
  ServerGeneralIR,
  ServerOutboundIR,
  ServerOutboundKind,
  ServerRuleIR,
  TlsSection,
  TransportKind,
  TransportSection,
} from '../types';
import { looksLikePath } from '../validation/syntax';

export interface ImportProblem {
  severity: 'error' | 'warning' | 'info';
  code: string;
  params?: Record<string, unknown>;
}

export interface ServerImportResult {
  config?: ServerConfigIR;
  problems: ImportProblem[];
}

const TRANSPORT_BY_KEY: Record<string, TransportKind> = {
  'ws-path': 'ws',
  'grpc-service-name': 'grpc',
  'xhttp-config': 'xhttp',
  'mekya-config': 'mekya',
  'mkcp-config': 'mkcp',
};

const SECURITY_KEYS = new Set(['shadow-tls', 'res-tls', 'jls-config', 'mux-option']);
const TLS_KEYS = new Set([
  'certificate',
  'private-key',
  'client-auth-type',
  'client-auth-cert',
  'ech-key',
  'reality-config',
  'tlsmirror-config',
]);
const COMMON_KEYS = new Set([
  'name',
  'type',
  'port',
  'listen',
  'routing-mark',
  'rule',
  'proxy',
]);
const AUTH_KEYS = new Set(['users', 'token', 'psk']);

const PROTOCOL_KEYS: Record<string, string[]> = {
  http: [],
  socks: ['udp'],
  mixed: ['udp'],
  redir: [],
  tproxy: ['udp'],
  tun: [
    'stack', 'dns-hijack', 'auto-detect-interface', 'auto-route', 'mtu',
    'inet4-address', 'inet6-address', 'strict-route', 'inet4-route-address',
    'inet6-route-address', 'endpoint-independent-nat', 'include-uid',
    'include-uid-range', 'exclude-uid', 'exclude-uid-range', 'include-mac-address',
    'exclude-mac-address', 'include-android-user', 'include-package', 'exclude-package',
  ],
  shadowsocks: [
    'cipher', 'password', 'udp', 'simple-obfs', 'plugin', 'plugin-opts',
  ],
  vmess: ['alterId'],
  vless: ['decryption', 'allow-insecure'],
  trojan: ['ss-option', 'allow-insecure'],
  anytls: ['padding-scheme', 'allow-insecure'],
  snell: ['psk', 'version', 'udp', 'obfs-opts'],
  mieru: ['transport', 'traffic-pattern', 'user-hint-is-mandatory'],
  sudoku: [
    'key', 'aead-method', 'padding-min', 'padding-max', 'table-type',
    'custom-table', 'custom-tables', 'handshake-timeout', 'enable-pure-downlink',
    'httpmask', 'disable-http-mask', 'http-mask-mode', 'path-root', 'fallback',
  ],
  trusttunnel: ['network', 'congestion-controller', 'bbr-profile'],
  shadowquic: [
    'alpn', 'quic-versions', 'zero-rtt', 'congestion-controller', 'up', 'down',
    'ignore-client-bandwidth', 'cwnd', 'bbr-profile', 'max-idle-time',
    'max-datagram-frame-size', 'recv-window-conn', 'recv-window',
    'disable-mtu-discovery', 'jls-upstream',
  ],
  hysteria2: [
    'up', 'down', 'ignore-client-bandwidth', 'obfs', 'obfs-password',
    'masquerade', 'bbr-profile', 'realm-opts', 'alpn',
  ],
  'hysteria2-realm': [
    'token', 'max-realms', 'max-realms-per-ip', 'trusted-proxy-header',
    'realm-name-pattern', 'alpn',
  ],
  tuic: [
    'token', 'uuid', 'password', 'ip', 'congestion-controller', 'bbr-profile',
    'alpn', 'disable-sni', 'reduce-rtt', 'request-timeout',
    'max-idle-time', 'authentication-timeout', 'udp-relay-mode',
    'max-udp-relay-packet-size', 'cwnd', 'heartbeat-interval', 'fast-open',
    'max-open-streams', 'zero-rtt', 'udp-over-stream',
    'udp-over-stream-version', 'allow-insecure',
  ],
  tunnel: ['network', 'target'],
};

function kebabToCamel(key: string): string {
  return key.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function deepCamel(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepCamel);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[kebabToCamel(key)] = deepCamel(child);
    }
    return out;
  }
  return value;
}

function certSource(value: unknown) {
  if (typeof value !== 'string' || value === '') return undefined;
  return {
    source: looksLikePath(value) ? ('path' as const) : ('pem' as const),
    value,
  };
}

function parseTls(raw: Record<string, any>): TlsSection {
  const tls: TlsSection = { mode: 'none' };

  if (raw['reality-config']) {
    const r = raw['reality-config'];
    tls.mode = 'reality';
    tls.reality = {
      dest: String(r.dest ?? ''),
      privateKey: String(r['private-key'] ?? ''),
      shortIds: Array.isArray(r['short-id']) ? r['short-id'].map(String) : [],
      serverNames: Array.isArray(r['server-names']) ? r['server-names'].map(String) : [],
      maxTimeDifference: typeof r['max-time-difference'] === 'number' ? r['max-time-difference'] : undefined,
      proxy: typeof r.proxy === 'string' ? r.proxy : undefined,
      limitFallbackUpload: r['limit-fallback-upload'] ? deepCamel(r['limit-fallback-upload']) : undefined,
      limitFallbackDownload: r['limit-fallback-download'] ? deepCamel(r['limit-fallback-download']) : undefined,
    } as TlsSection['reality'];
  }

  if (raw['tlsmirror-config']) {
    tls.mode = 'tlsmirror';
    tls.tlsmirror = deepCamel(raw['tlsmirror-config']) as Record<string, unknown>;
  }

  if (tls.mode === 'none' && (raw.certificate || raw['private-key'])) tls.mode = 'tls';
  if (raw.certificate) tls.certificate = certSource(raw.certificate);
  if (raw['private-key']) tls.privateKey = certSource(raw['private-key']);

  const cat = raw['client-auth-type'];
  if (
    cat === '' || cat === 'request' || cat === 'require-any' ||
    cat === 'verify-if-given' || cat === 'require-and-verify'
  ) {
    tls.clientAuthType = cat;
  }
  if (raw['client-auth-cert']) tls.clientAuthCert = certSource(raw['client-auth-cert']);
  if (typeof raw['ech-key'] === 'string' && raw['ech-key'] !== '') tls.echKey = raw['ech-key'];

  return tls;
}

function parseTransport(raw: Record<string, any>): TransportSection {
  let kind: TransportKind = 'tcp';
  for (const [key, mapped] of Object.entries(TRANSPORT_BY_KEY)) {
    if (key in raw && raw[key] !== null && raw[key] !== '') {
      kind = mapped;
      break;
    }
  }

  const transport: TransportSection = { kind };
  if (typeof raw['ws-path'] === 'string') transport.wsPath = raw['ws-path'];
  if (typeof raw['grpc-service-name'] === 'string') {
    transport.grpcServiceName = raw['grpc-service-name'];
  }
  if (raw['xhttp-config']) transport.xhttp = deepCamel(raw['xhttp-config']) as TransportSection['xhttp'];
  if (raw['mekya-config']) {
    transport.mekyaConfig = {
      enable: true,
      ...(deepCamel(raw['mekya-config']) as Record<string, unknown>),
    } as TransportSection['mekyaConfig'];
  }
  if (raw['mkcp-config']) {
    transport.mkcpConfig = {
      enable: true,
      ...(deepCamel(raw['mkcp-config']) as Record<string, unknown>),
    } as TransportSection['mkcpConfig'];
  }
  if (raw['kcp-tun']) transport.kcpTun = deepCamel(raw['kcp-tun']) as TransportSection['kcpTun'];

  return transport;
}

function parseSecurity(raw: Record<string, any>): SecurityBlocks {
  const security: SecurityBlocks = {};

  if (raw['shadow-tls']) {
    const s = deepCamel(raw['shadow-tls']) as Record<string, unknown>;
    security.shadowTls = {
      enable: s.enable === true || Object.keys(s).length > 0 ? true : false,
      version: (typeof s.version === 'number' ? s.version : 3) as 1 | 2 | 3,
      password: typeof s.password === 'string' ? s.password : undefined,
      users: Array.isArray(s.users)
        ? (s.users as Record<string, string>[]).map((u) => ({
            name: String(u.name ?? ''),
            password: String(u.password ?? ''),
          }))
        : undefined,
      handshake: deepCamel(s.handshake ?? {}) as SecurityBlocks['shadowTls'] extends undefined ? never : { dest: string; proxy?: string },
    };
  }

  if (raw['res-tls']) security.resTls = { enable: true, ...(deepCamel(raw['res-tls']) as Record<string, unknown>) } as unknown as SecurityBlocks['resTls'];
  if (raw['jls-config']) security.jls = { enable: true, ...(deepCamel(raw['jls-config']) as Record<string, unknown>) } as unknown as SecurityBlocks['jls'];
  if (raw['mux-option']) security.muxOption = deepCamel(raw['mux-option']) as SecurityBlocks['muxOption'];

  return security;
}

function parseAuth(raw: Record<string, any>, kind: ListenerKind): AuthSection {
  if (Array.isArray(raw.users)) {
    return {
      mode: 'list',
      token: [],
      users: raw.users.map((entry: Record<string, any>) => ({
        username: typeof entry.username === 'string' ? entry.username : undefined,
        uuid: typeof entry.uuid === 'string' ? entry.uuid : undefined,
        password: typeof entry.password === 'string' ? entry.password : undefined,
        alterId: typeof entry.alterId === 'number' ? entry.alterId : undefined,
        flow: typeof entry.flow === 'string' ? entry.flow : undefined,
        name: typeof entry.name === 'string' ? entry.name : undefined,
      })),
    };
  }
  if (raw.users && typeof raw.users === 'object') {
    return {
      mode: 'map',
      token: [],
      users: Object.entries(raw.users as Record<string, string>).map(([username, password]) => ({
        username,
        password: String(password),
      })),
    };
  }
  if (Array.isArray(raw.token)) {
    return { mode: 'token', token: raw.token.map(String), users: [] };
  }
  if (typeof raw.psk === 'string' && raw.psk !== '') {
    return { mode: 'psk', psk: raw.psk, token: [], users: [] };
  }
  if (kind === 'http' || kind === 'socks' || kind === 'mixed') {
    return { mode: 'inherit', users: [], token: [] };
  }
  return { mode: 'none', users: [], token: [] };
}

export function listenerFromYamlNode(
  raw: Record<string, any>
): { listener: ListenerIR; unknownKeys: string[] } | null {
  if (!raw || typeof raw !== 'object') return null;

  const yamlType = String(raw.type ?? '').trim();
  const kind = (yamlType === '' ? 'http' : yamlType) as ListenerKind;
  let tuicVersion: 'v4' | 'v5' | undefined;
  if (kind === 'tuic') {
    tuicVersion = Array.isArray(raw.token) ? 'v4' : 'v5';
  }

  const knownProtocol = new Set([
    ...(PROTOCOL_KEYS[kind] ?? []),
  ]);

  const unknownKeys: string[] = [];
  const protocol: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (
      COMMON_KEYS.has(key) ||
      AUTH_KEYS.has(key) ||
      TLS_KEYS.has(key) ||
      key in TRANSPORT_BY_KEY ||
      SECURITY_KEYS.has(key)
    ) {
      continue;
    }
    if (knownProtocol.has(key)) {
      protocol[key] = value;
    } else {
      unknownKeys.push(key);
    }
  }

  const listener: ListenerIR = {
    id: generateId(),
    enabled: true,
    type: kind,
    tuicVersion,
    name: typeof raw.name === 'string' && raw.name !== '' ? raw.name : `${yamlType || 'listener'}-in`,
    listen: typeof raw.listen === 'string' && raw.listen !== '' ? raw.listen : '0.0.0.0',
    port: raw.port !== undefined && raw.port !== null ? String(raw.port) : '',
    routingMark: typeof raw['routing-mark'] === 'number' ? raw['routing-mark'] : undefined,
    rule: typeof raw.rule === 'string' ? raw.rule : undefined,
    proxy: typeof raw.proxy === 'string' ? raw.proxy : undefined,
    auth: parseAuth(raw, kind),
    tls: parseTls(raw),
    transport: parseTransport(raw),
    protocol,
    security: parseSecurity(raw),
    extensions: Object.fromEntries(unknownKeys.map((key) => [key, raw[key]])),
  };

  return { listener, unknownKeys };
}

// DNS is carried natively in kebab-case (shared with the client document's
// DnsConfig), so import keeps every key the file carries rather than picking
// a fixed nine: a config written elsewhere keeps its full dns surface through
// a round-trip. Only list-shaped fields get the bare-string tolerance mihomo
// itself allows.
const DNS_LIST_KEYS = new Set([
  'fake-ip-filter',
  'default-nameserver',
  'nameserver',
  'fallback',
  'proxy-server-nameserver',
  'direct-nameserver',
]);

// The top-level keys that belong to the `general:` section. They are the same
// documented set the client import carries, kept here so a server config
// written elsewhere round-trips its general frame exactly like the client's.
const GENERAL_SCALAR_KEYS = [
  'mode',
  'mixed-port',
  'port',
  'socks-port',
  'redir-port',
  'tproxy-port',
  'allow-lan',
  'bind-address',
  'log-level',
  'ipv6',
  'external-controller',
  'external-ui',
  'external-ui-name',
  'external-ui-url',
  'external-doh-server',
  'secret',
  'find-process-mode',
  'keep-alive-interval',
  'keep-alive-idle',
  'disable-keep-alive',
  'tcp-concurrent',
  'unified-delay',
  'interface-name',
  'routing-mark',
  'global-client-fingerprint',
  'global-ua',
  'etag-support',
] as const;

const TUNABLE_SCALAR_KEYS = [
  'stack',
  'dns-mode',
  'device',
  'auto-route',
  'auto-redirect',
  'auto-detect-interface',
  'strict-route',
  'mtu',
  'gso',
  'gso-max-size',
  'inet6-address',
  'udp-timeout',
  'iproute2-table-index',
  'iproute2-rule-index',
  'endpoint-independent-nat',
] as const;

// `tun:` also carries one nested object (dns-hijack is a list of address:port,
// managed by the general schema) — these stay shape-tolerant below.
export function parseGeneralNode(raw: Record<string, any> | undefined): ServerGeneralIR {
  const general: Record<string, unknown> = {
    mode: raw?.mode === 'global' || raw?.mode === 'direct' ? raw.mode : 'rule',
    'allow-lan': raw?.['allow-lan'] === true,
    'log-level': raw?.['log-level'] || 'info',
    ipv6: raw?.ipv6 === true,
  };

  if (!raw) return general as unknown as ServerGeneralIR;

  for (const key of GENERAL_SCALAR_KEYS) {
    if (key in raw && raw[key] !== undefined && raw[key] !== null && raw[key] !== '') {
      general[key] = raw[key];
    }
  }

  if (raw.tun && typeof raw.tun === 'object' && raw.tun.enable === true) {
    const tun: Record<string, unknown> = { enable: true };
    for (const key of TUNABLE_SCALAR_KEYS) {
      if (
        key in raw.tun &&
        raw.tun[key] !== undefined &&
        raw.tun[key] !== null &&
        (key !== 'dns-mode' || raw.tun[key] !== '')
      ) {
        tun[key] = raw.tun[key];
      }
    }
    // List-shaped keys arrive as arrays; include-uid/exclude-uid are numbers.
    for (const key of [
      'dns-hijack',
      'route-address-set',
      'route-exclude-address-set',
      'route-address',
      'route-exclude-address',
      'include-interface',
      'exclude-interface',
      'include-mac-address',
      'exclude-mac-address',
      'include-android-user',
      'include-package',
      'exclude-package',
    ]) {
      if (Array.isArray(raw.tun[key])) tun[key] = raw.tun[key].map(String);
    }
    for (const key of ['include-uid', 'exclude-uid'] as const) {
      if (Array.isArray(raw.tun[key])) tun[key] = raw.tun[key].map(Number);
    }
    for (const key of ['include-uid-range', 'exclude-uid-range'] as const) {
      if (Array.isArray(raw.tun[key])) tun[key] = raw.tun[key].map(String);
    }
    general.tun = tun;
  }

  return general as unknown as ServerGeneralIR;
}

export function parseDnsNode(raw: Record<string, any> | undefined): ServerDnsIR {
  if (!raw || typeof raw !== 'object') return { enable: false };
  const dns: Record<string, unknown> = { enable: raw.enable === true };
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'enable') continue;
    if (value === undefined || value === null) continue;
    if (DNS_LIST_KEYS.has(key)) {
      if (Array.isArray(value)) {
        dns[key] = value.map(String);
      } else if (typeof value === 'string' && value.trim() !== '') {
        // A bare string is accepted by mihomo and means a one-entry list.
        dns[key] = [value];
      }
      continue;
    }
    dns[key] = value;
  }
  return dns as unknown as ServerDnsIR;
}

export function importServerYaml(content: string): ServerImportResult {
  const problems: ImportProblem[] = [];

  // An empty document is an empty config — the round-trip of the exporter's
  // empty preview. js-yaml reads it as null, which the mapping check below
  // would reject as invalid; treat it up front instead.
  if (content.trim() === '') {
    return {
      config: {
        schemaVersion: 1,
        general: parseGeneralNode(undefined),
        dns: parseDnsNode(undefined),
        listeners: [],
        outbounds: [],
        rules: [],
      },
      problems: [{ severity: 'info', code: 'server.import.noListeners' }],
    };
  }

  let parsed: unknown;
  try {
    parsed = yaml.load(content);
  } catch (error) {
    return {
      problems: [
        {
          severity: 'error',
          code: 'server.import.yamlInvalid',
          params: { message: error instanceof Error ? error.message : 'unknown' },
        },
      ],
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { problems: [{ severity: 'error', code: 'server.import.notMapping' }] };
  }

  const doc = parsed as Record<string, any>;
  const rawListeners = doc.listeners;

  if (rawListeners === undefined) {
    problems.push({ severity: 'info', code: 'server.import.noListeners' });
  } else if (!Array.isArray(rawListeners)) {
    return { problems: [{ severity: 'error', code: 'server.import.listenersNotList' }] };
  }

  const listeners: ListenerIR[] = [];
  if (Array.isArray(rawListeners)) {
    rawListeners.forEach((node: unknown, index: number) => {
      if (!node || typeof node !== 'object' || Array.isArray(node)) {
        problems.push({
          severity: 'warning',
          code: 'server.import.listenerSkipped',
          params: { index: index + 1 },
        });
        return;
      }
      const result = listenerFromYamlNode(node as Record<string, any>);
      if (!result) {
        problems.push({
          severity: 'warning',
          code: 'server.import.listenerSkipped',
          params: { index: index + 1 },
        });
        return;
      }
      listeners.push(result.listener);
      if (result.unknownKeys.length > 0) {
        problems.push({
          severity: 'info',
          code: 'server.import.extensionsPreserved',
          params: { name: result.listener.name, keys: result.unknownKeys.join(', ') },
        });
      }
    });
  }

  const ignoredTopLevel = Object.keys(doc).filter(
    (key) => key !== 'listeners' && key !== 'dns' && key !== 'proxies' && key !== 'rules' && key !== 'tun' && !GENERAL_SCALAR_KEYS.includes(key as any)
  );
  if (ignoredTopLevel.length > 0) {
    problems.push({
      severity: 'info',
      code: 'server.import.topLevelIgnored',
      params: { keys: ignoredTopLevel.join(', ') },
    });
  }

  const config: ServerConfigIR = {
    schemaVersion: 1,
    general: parseGeneralNode(doc),
    dns: parseDnsNode(doc.dns as Record<string, any> | undefined),
    listeners,
    outbounds: parseOutboundsNode(doc.proxies, problems),
    rules: parseRulesNode(doc.rules),
  };

  return { config, problems };
}

// `proxies:` carries the user-defined outbounds. Only the kinds the editor
// can round-trip are modelled; anything else is reported and left out rather
// than half-imported into a shape that would export it wrong.
const OUTBOUND_KINDS = new Set(['direct', 'http', 'socks5']);

export function parseOutboundsNode(
  raw: unknown,
  problems: ImportProblem[]
): ServerOutboundIR[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    problems.push({ severity: 'warning', code: 'server.import.outboundSkipped', params: { index: 1 } });
    return [];
  }
  const outbounds: ServerOutboundIR[] = [];
  raw.forEach((node: unknown, index: number) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      problems.push({
        severity: 'warning',
        code: 'server.import.outboundSkipped',
        params: { index: index + 1 },
      });
      return;
    }
    const entry = node as Record<string, any>;
    const type = String(entry.type ?? '');
    if (!OUTBOUND_KINDS.has(type)) {
      problems.push({
        severity: 'info',
        code: 'server.import.outboundIgnored',
        params: { type, name: String(entry.name ?? `#${index + 1}`) },
      });
      return;
    }
    const outbound: ServerOutboundIR = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      enabled: true,
      type: type as ServerOutboundKind,
      name: String(entry.name ?? ''),
    };
    if (type === 'http' || type === 'socks5') {
      outbound.server = typeof entry.server === 'string' ? entry.server : '';
      const port = Number(entry.port);
      outbound.port = Number.isInteger(port) ? port : undefined;
      if (typeof entry.username === 'string') outbound.username = entry.username;
      if (typeof entry.password === 'string') outbound.password = entry.password;
    }
    if (type === 'socks5') {
      if (entry.udp === true) outbound.udp = true;
      if (entry.tls === true) outbound.tls = true;
    }
    outbounds.push(outbound);
  });
  return outbounds;
}

// Rules arrive as strings (`TYPE,payload,target[,no-resolve]`). AND/OR/NOT
// payloads contain commas themselves, so the parse splits only the head (the
// type) and the tail (target, optional no-resolve) and keeps the middle whole.
export function parseRulesNode(raw: unknown): ServerRuleIR[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is string => typeof entry === 'string')
    .map((line) => {
      const trimmed = line.trim();
      const firstComma = trimmed.indexOf(',');
      const type = firstComma === -1 ? trimmed : trimmed.slice(0, firstComma);
      let middle = firstComma === -1 ? '' : trimmed.slice(firstComma + 1);
      let noResolve = false;
      if (/\bno-resolve\s*$/i.test(middle)) {
        noResolve = true;
        middle = middle.replace(/,?\s*no-resolve\s*$/i, '');
      }
      const lastComma = middle.lastIndexOf(',');
      let payload = '';
      let target = middle.trim();
      if (lastComma !== -1) {
        payload = middle.slice(0, lastComma).trim();
        target = middle.slice(lastComma + 1).trim();
      }
      if (/^MATCH$/i.test(type)) payload = '';
      return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        type: type.toUpperCase(),
        payload,
        target,
        ...(noResolve ? { noResolve: true } : {}),
      };
    })
    .filter((rule) => rule.type !== '' && rule.target !== '');
}
