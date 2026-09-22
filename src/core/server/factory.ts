import { generateId } from '../ir/factory';
import { randomIntInRange } from '../shared/generators/crypto';
import { deriveRealityPublicKey } from '../shared/generators/reality';
import type {
  AuthSection,
  ListenerIR,
  ListenerKind,
  ServerConfigIR,
  ServerDnsIR,
  ServerGeneralIR,
  ServerOutboundIR,
  ServerOutboundKind,
  ServerRuleIR,
  TlsSection,
  TransportKind,
  TuicVersion,
  XHttpOpts
} from './types';

export const LISTENER_KINDS: ListenerKind[] = [
  'http',
  'socks',
  'mixed',
  'redir',
  'tproxy',
  'tun',
  'shadowsocks',
  'vmess',
  'vless',
  'trojan',
  'anytls',
  'snell',
  'mieru',
  'sudoku',
  'trusttunnel',
  'shadowquic',
  'hysteria2',
  'hysteria2-realm',
  'tunnel',
  'tuic',
];

export function yamlTypeOf(kind: ListenerKind): string {
  return kind;
}

const DEFAULT_PORTS: Record<string, string> = {
  http: '7890',
  socks: '7891',
  mixed: '7892',
  redir: '7893',
  tproxy: '7894',
  tun: '',
  shadowsocks: '10001',
  vmess: '10814',
  vless: '10817',
  trojan: '10819',
  anytls: '10818',
  snell: '10815',
  mieru: '10818',
  sudoku: '8443',
  trusttunnel: '10821',
  shadowquic: '10822',
  hysteria2: '8443',
  'hysteria2-realm': '10820',
  tunnel: '10816',
  'tuic-v4': '10003',
  'tuic-v5': '10004',
};

const UDP_FIELD_TYPES = new Set<ListenerKind>([
  'socks',
  'mixed',
  'tproxy',
  'shadowsocks',
  'snell',
]);

function defaultPort(kind: ListenerKind, tuicVersion?: TuicVersion): string {
  if (kind === 'tuic') {
    return DEFAULT_PORTS[`tuic-${tuicVersion ?? 'v5'}`] ?? '';
  }
  return DEFAULT_PORTS[kind] ?? '';
}

// Ports a freshly created listener may take. Unprivileged, so the process does
// not need root and nothing well-known gets shadowed by accident.
const LISTENER_PORT_MIN = 1024;
const LISTENER_PORT_MAX = 65535;

// Every port an existing listener claims. A port is usually one number, but
// the field accepts expressions like `8000-8010` or `443,8443`, and any port
// inside such an expression is just as taken as a lone one.
function usedListenerPorts(listeners: ListenerIR[]): Set<number> {
  const used = new Set<number>();
  for (const listener of listeners) {
    const raw = String(listener.port ?? '');
    if (raw === '') continue;
    for (const match of raw.matchAll(/(\d+)(?:\s*-\s*(\d+))?/g)) {
      const start = Number(match[1]);
      const end = match[2] !== undefined ? Number(match[2]) : start;
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      const lo = Math.min(start, end);
      const hi = Math.min(Math.max(start, end), LISTENER_PORT_MAX);
      for (let port = lo; port <= hi; port++) used.add(port);
    }
  }
  return used;
}

/**
 * Picks the listen port for a newly created listener: uniformly random in the
 * unprivileged range and guaranteed not to collide with anything an existing
 * listener already binds — including ports named inside range expressions.
 * Returns '' only in the degenerate case where nothing is free.
 */
export function pickFreeListenerPort(existing: ListenerIR[]): string {
  const used = usedListenerPorts(existing);
  const span = LISTENER_PORT_MAX - LISTENER_PORT_MIN + 1;
  if (used.size >= span) return '';
  for (;;) {
    const candidate = randomIntInRange(LISTENER_PORT_MIN, LISTENER_PORT_MAX);
    if (!used.has(candidate)) return String(candidate);
  }
}

function defaultAuth(kind: ListenerKind, tuicVersion?: TuicVersion): AuthSection {
  const empty = (): AuthSection => ({ mode: 'none', users: [], token: [] });

  switch (kind) {
    case 'http':
    case 'socks':
    case 'mixed':
      return { mode: 'inherit', users: [], token: [] };
    case 'vmess':
      return {
        mode: 'list',
        users: [{ username: '', uuid: '', alterId: 0 }],
        token: [],
      };
    case 'vless':
      return {
        mode: 'list',
        users: [{ username: '', uuid: '', flow: '' }],
        token: [],
      };
    case 'trojan':
    case 'trusttunnel':
    case 'shadowquic':
      return {
        mode: 'list',
        users: [{ username: '', password: '' }],
        token: [],
      };
    case 'anytls':
    case 'mieru':
    case 'hysteria2':
      return {
        mode: 'map',
        users: [{ username: '', password: '' }],
        token: [],
      };
    case 'tuic':
      if (tuicVersion === 'v4') {
        return { mode: 'token', users: [], token: [''] };
      }
      return { mode: 'map', users: [{ username: '', password: '' }], token: [] };
    case 'hysteria2-realm':
      return { mode: 'none', users: [], token: [] };
    case 'snell':
      return { mode: 'psk', users: [], token: [], psk: '' };
    default:
      return empty();
  }
}

function generateRandomPaddingKeypair(): { key: string; header: string } {
  const key = crypto.randomUUID().replace(/-/g, '');
  const header = `x-${key.slice(0, 8)}`;
  return { key, header };
}
function defaultTransportSectionXHttpOpts(): XHttpOpts {
  const { key, header } = generateRandomPaddingKeypair();
  return {
    path: '/',
    host: '',
    xPaddingObfsMode:true,
    xPaddingPlacement:'queryInHeader',
    xPaddingMethod:'tokenish',
    xPaddingHeader:header,
    xPaddingKey:key,
  };
}

function defaultTransportKind(kind: ListenerKind): TransportKind {
  if (kind === 'vmess' || kind === 'vless' || kind === 'trojan') {
    return 'tcp';
  }
  return 'none';
}

function defaultProtocol(kind: ListenerKind): Record<string, unknown> {
  const protocol: Record<string, unknown> = {};

  if (UDP_FIELD_TYPES.has(kind)) {
    protocol.udp = true;
  }

  switch (kind) {
    case 'tunnel':
      protocol.network = ['tcp', 'udp'];
      protocol.target = '';
      break;
    case 'tproxy':
      break;
    case 'tun':
      protocol.stack = 'system';
      protocol['dns-hijack'] = ['0.0.0.0:53'];
      break;
    case 'trusttunnel':
      protocol.network = ['tcp', 'udp'];
      protocol['congestion-controller'] = 'bbr';
      break;
    case 'snell':
      protocol.version = 4;
      break;
    case 'mieru':
      protocol.transport = 'TCP';
      break;
    case 'sudoku':
      protocol.key = '';
      protocol['aead-method'] = 'chacha20-poly1305';
      break;
    case 'hysteria2-realm':
      protocol.token = '';
      protocol.alpn = ['h2', 'http/1.1'];
      break;
    case 'tuic':
      protocol['max-idle-time'] = 15000;
      protocol['authentication-timeout'] = 1000;
      protocol.alpn = ['h3'];
      protocol['max-udp-relay-packet-size'] = 1500;
      protocol['congestion-controller'] = 'bbr';
      break;
    case 'shadowquic':
      protocol.cwnd = 32;
      break;
    case 'hysteria2':
      protocol.alpn = ['h3'];
      break;
    default:
      break;
  }

  return protocol;
}

export function createListener(kind: ListenerKind, tuicVersion?: TuicVersion): ListenerIR {
  const version = kind === 'tuic' ? (tuicVersion ?? 'v5') : undefined;
  const tlsCapable =
    kind === 'http' ||
    kind === 'socks' ||
    kind === 'mixed' ||
    kind === 'vmess' ||
    kind === 'vless' ||
    kind === 'trojan' ||
    kind === 'anytls' ||
    kind === 'trusttunnel' ||
    kind === 'tuic' ||
    kind === 'hysteria2' ||
    kind === 'hysteria2-realm';

  return {
    id: generateId(),
    enabled: true,
    type: kind,
    tuicVersion: version,
    name: `${yamlTypeOf(kind)}-in`,
    listen: '0.0.0.0',
    port: defaultPort(kind, version),
    auth: defaultAuth(kind, version),
    tls: { mode: tlsCapable ? 'tls' : 'none' },
    transport: { kind: defaultTransportKind(kind), xhttp: defaultTransportSectionXHttpOpts() },
    protocol: defaultProtocol(kind),
    security: {},
    extensions: {},
  };
}

export function createServerDns(): ServerDnsIR {
  return { enable: false };
}

// The server's general section opens with the same defaults the client's does:
// rule mode, a mixed inbound on 7890, allow-lan off, info logging. Every other
// key stays unset so the form's defaults and the exporter's "emit only what is
// set" rule agree on a clean, minimal document.
export function createServerGeneral(): ServerGeneralIR {
  return {
    mode: 'rule',
    'mixed-port': 7890,
    'allow-lan': false,
    'log-level': 'info',
    ipv6: false,
  };
}

// A half-built Reality section is a normal state — switching the TLS mode
// over happens before anything is filled in, and the first keystroke into a
// field would otherwise create `reality` as `{ dest: "x" }` with its list
// fields missing. Every writer scaffolds the full shape first, so validation
// and export always see complete arrays.
export function ensureRealitySection(tls: TlsSection): TlsSection {
  if (tls.reality) return tls;
  return {
    ...tls,
    reality: { dest: '', privateKey: '', shortIds: [], serverNames: [] },
  };
}

// Writing a Reality private key is also how the document learns its public
// half: mihomo derives it on load, but share links need the value stored where
// they can reach it, so every write to `tls.reality.privateKey` — generated,
// pasted or imported — refreshes the stored public key alongside. Clearing the
// private key clears it too.
export function syncDerivedRealityKey(tls: TlsSection, path: string, value: unknown): void {
  if (path !== 'tls.reality.privateKey' || !tls.reality) return;
  const priv = typeof value === 'string' ? value : '';
  tls.reality.publicKey = priv === '' ? undefined : deriveRealityPublicKey(priv);
}

export function createServerOutbound(kind: ServerOutboundKind): ServerOutboundIR {
  const outbound: ServerOutboundIR = {
    id: generateId(),
    enabled: true,
    type: kind,
    name: `${kind}-out`,
  };
  if (kind === 'http' || kind === 'socks5') {
    outbound.server = '';
    outbound.port = kind === 'http' ? 8080 : 1080;
  }
  return outbound;
}

export function createServerRule(): ServerRuleIR {
  return {
    id: generateId(),
    type: 'DOMAIN-SUFFIX',
    payload: '',
    target: 'DIRECT',
  };
}

export function createDefaultServerConfig(): ServerConfigIR {
  return {
    schemaVersion: 1,
    general: createServerGeneral(),
    dns: createServerDns(),
    listeners: [],
    outbounds: [],
    rules: [],
    servers: [],
  };
}
