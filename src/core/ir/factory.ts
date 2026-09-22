import type {
  DnsConfig,
  GeneralConfig,
  MihomoIR,
  ProxyGroup,
  ProxyNode,
  ProxyProvider,
  Rule,
} from './types';

// Generate a unique ID for UI elements
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Create a default empty IR structure
export function createDefaultIR(): MihomoIR {
  return {
    version: '1.0.0',
    general: createDefaultGeneral(),
    dns: createDefaultDns(),
    proxies: [],
    proxyProviders: {},
    proxyGroups: [],
    rules: [],
    ruleProviders: {},
  };
}

// Create default general configuration
export function createDefaultGeneral(): GeneralConfig {
  return {
    mode: 'rule',
    'mixed-port': 7890,
    'allow-lan': false,
    'log-level': 'info',
    ipv6: false,
    tun: {
      enable: false,
      stack: 'system',
      'auto-route': true,
      'auto-detect-interface': true,
    },
  };
}

// Create default DNS configuration
export function createDefaultDns(): DnsConfig {
  return {
    enable: true,
    ipv6: false,
    'enhanced-mode': 'fake-ip',
    'fake-ip-range': '198.18.0.1/16',
    'fake-ip-filter': [
      '*.lan',
      'localhost.ptlogin2.qq.com',
    ],
    'default-nameserver': [
      'udp://223.5.5.5',
      'udp://223.6.6.6',
    ],
    nameserver: [
      'udp://223.6.6.6',
      'tls://223.6.6.6',
    ],
    fallback: [
      'tls://8.8.4.4',
      'tls://1.0.0.1',
      'https://1.0.0.1/dns-query',
    ],
    'fallback-filter': {
      geoip: true,
      'geoip-code': 'CN',
      ipcidr: ['240.0.0.0/4'],
    },
  };
}

// Create a default VLESS proxy node
export function createDefaultVlessProxy(): ProxyNode {
  return {
    id: generateId(),
    name: 'VLESS Node',
    type: 'vless',
    server: 'example.com',
    port: 443,
    config: {
      uuid: '',
      flow: '',
      udp: true,
      network: 'tcp',
      tls: true,
      'skip-cert-verify': false,
      servername: '',
      'xhttp-opts': {
        host: 'example.com',
        path: '/',
        mode: 'auto',
      },
    },
  };
}

// Create a default Hysteria2 proxy node
export function createDefaultHysteria2Proxy(): ProxyNode {
  return {
    id: generateId(),
    name: 'Hysteria2 Node',
    type: 'hysteria2',
    server: 'example.com',
    port: 443,
    config: {
      password: '',
      sni: '',
      'skip-cert-verify': false,
    },
  };
}

// Create a default TUIC proxy node
export function createDefaultTuicProxy(): ProxyNode {
  return {
    id: generateId(),
    name: 'TUIC Node',
    type: 'tuic',
    server: 'example.com',
    port: 443,
    config: {
      uuid: '',
      password: '',
      sni: '',
      'skip-cert-verify': false,
      'congestion-controller': 'cubic',
    },
  };
}

// Create a default Trojan proxy node
export function createDefaultTrojanProxy(): ProxyNode {
  return {
    id: generateId(),
    name: 'Trojan Node',
    type: 'trojan',
    server: 'example.com',
    port: 443,
    config: {
      password: '',
      sni: '',
      'skip-cert-verify': false,
      network: 'tcp',
    },
  };
}

// A direct outbound has no remote endpoint — server/port are deliberately absent.
export function createDefaultDirectProxy(): ProxyNode {
  return {
    id: generateId(),
    name: 'DIRECT-OUT',
    type: 'direct',
    config: {},
  };
}

export function createDefaultHttpProxy(): ProxyNode {
  return {
    id: generateId(),
    name: 'HTTP Node',
    type: 'http',
    server: 'example.com',
    port: 8080,
    config: { tls: false, 'skip-cert-verify': false },
  };
}

export function createDefaultSocks5Proxy(): ProxyNode {
  return {
    id: generateId(),
    name: 'SOCKS5 Node',
    type: 'socks5',
    server: 'example.com',
    port: 1080,
    config: { udp: true, tls: false, 'skip-cert-verify': false },
  };
}

export function createDefaultVmessProxy(): ProxyNode {
  return {
    id: generateId(),
    name: 'VMess Node',
    type: 'vmess',
    server: 'example.com',
    port: 443,
    config: { uuid: '', alterId: 0, cipher: 'auto', udp: true, network: 'tcp', tls: false },
  };
}

export function createDefaultSsProxy(): ProxyNode {
  return {
    id: generateId(),
    name: 'Shadowsocks Node',
    type: 'ss',
    server: 'example.com',
    port: 443,
    config: { cipher: 'aes-128-gcm', password: '', udp: true },
  };
}

export function createDefaultSnellProxy(): ProxyNode {
  return {
    id: generateId(),
    name: 'Snell Node',
    type: 'snell',
    server: 'example.com',
    port: 44046,
    config: { psk: '', version: 4, udp: true, reuse: false },
  };
}

export function createDefaultSsrProxy(): ProxyNode {
  return {
    id: generateId(),
    name: 'ShadowsocksR Node',
    type: 'ssr',
    server: 'example.com',
    port: 443,
    config: {
      cipher: 'aes-128-cfb',
      password: '',
      protocol: 'origin',
      obfs: 'plain',
      udp: false,
    },
  };
}

export function createDefaultAnytlsProxy(): ProxyNode {
  return {
    id: generateId(),
    name: 'AnyTLS Node',
    type: 'anytls',
    server: 'example.com',
    port: 443,
    config: { password: '', udp: true, 'skip-cert-verify': false },
  };
}

export function createDefaultHysteriaProxy(): ProxyNode {
  return {
    id: generateId(),
    name: 'Hysteria Node',
    type: 'hysteria',
    server: 'example.com',
    port: 443,
    config: { 'auth-str': '', protocol: 'udp', up: '30 Mbps', down: '200 Mbps' },
  };
}

export function createDefaultWireguardProxy(): ProxyNode {
  return {
    id: generateId(),
    name: 'WireGuard Node',
    type: 'wireguard',
    server: 'example.com',
    port: 51820,
    config: { ip: '172.16.0.2', 'private-key': '', 'public-key': '', udp: true },
  };
}

export function createDefaultSshProxy(): ProxyNode {
  return {
    id: generateId(),
    name: 'SSH Node',
    type: 'ssh',
    server: 'example.com',
    port: 22,
    config: { username: 'root' },
  };
}

export function createDefaultMieruProxy(): ProxyNode {
  return {
    id: generateId(),
    name: 'Mieru Node',
    type: 'mieru',
    server: 'example.com',
    port: 443,
    config: { username: '', password: '', transport: 'TCP' },
  };
}

export function createDefaultSudokuProxy(): ProxyNode {
  return {
    id: generateId(),
    name: 'Sudoku Node',
    type: 'sudoku',
    server: 'example.com',
    port: 443,
    config: { key: '', 'aead-method': 'chacha20-poly1305' },
  };
}

export function createDefaultShadowquicProxy(): ProxyNode {
  return {
    id: generateId(),
    name: 'ShadowQUIC Node',
    type: 'shadowquic',
    server: 'example.com',
    port: 443,
    config: { username: '', password: '' },
  };
}

export function createDefaultTrusttunnelProxy(): ProxyNode {
  return {
    id: generateId(),
    name: 'TrustTunnel Node',
    type: 'trusttunnel',
    server: 'example.com',
    port: 443,
    config: { username: '', password: '', 'health-check': true, udp: true },
  };
}

export function createDefaultGostRelayProxy(): ProxyNode {
  return {
    id: generateId(),
    name: 'GOST Relay Node',
    type: 'gost-relay',
    server: 'relay.example.com',
    port: 443,
    config: { udp: true, tls: true },
  };
}

export function createDefaultDnsOutProxy(): ProxyNode {
  return {
    id: generateId(),
    // The dns outbound has no endpoint.
    name: 'dns-out',
    type: 'dns',
    config: {},
  };
}

export function createDefaultRematchProxy(): ProxyNode {
  return {
    id: generateId(),
    name: 'rematch-out',
    type: 'rematch',
    config: {},
  };
}

export function createDefaultMasqueProxy(): ProxyNode {
  return {
    id: generateId(),
    name: 'MASQUE Node',
    type: 'masque',
    server: 'example.com',
    port: 443,
    config: { 'private-key': '', 'public-key': '', udp: true },
  };
}

export function createDefaultTailscaleProxy(): ProxyNode {
  return {
    id: generateId(),
    name: 'Tailscale Node',
    // Tailscale has no server endpoint of its own.
    type: 'tailscale',
    config: {},
  };
}

export function createDefaultZerotierProxy(): ProxyNode {
  return {
    id: generateId(),
    name: 'ZeroTier Node',
    type: 'zerotier',
    config: { network: '', udp: true },
  };
}

export function createDefaultOpenvpnProxy(): ProxyNode {
  return {
    id: generateId(),
    name: 'OpenVPN Node',
    type: 'openvpn',
    server: 'example.com',
    port: 1194,
    config: { proto: 'udp', cipher: 'AES-128-GCM', auth: 'SHA256' },
  };
}

// Create a default proxy by type
export function createDefaultProxyByType(type: string): ProxyNode {
  switch (type) {
    case 'vless':
      return createDefaultVlessProxy();
    case 'hysteria2':
      return createDefaultHysteria2Proxy();
    case 'tuic':
      return createDefaultTuicProxy();
    case 'trojan':
      return createDefaultTrojanProxy();
    case 'direct':
      return createDefaultDirectProxy();
    case 'http':
      return createDefaultHttpProxy();
    case 'socks5':
      return createDefaultSocks5Proxy();
    case 'vmess':
      return createDefaultVmessProxy();
    case 'ss':
      return createDefaultSsProxy();
    case 'snell':
      return createDefaultSnellProxy();
    case 'ssr':
      return createDefaultSsrProxy();
    case 'anytls':
      return createDefaultAnytlsProxy();
    case 'hysteria':
      return createDefaultHysteriaProxy();
    case 'wireguard':
      return createDefaultWireguardProxy();
    case 'ssh':
      return createDefaultSshProxy();
    case 'mieru':
      return createDefaultMieruProxy();
    case 'sudoku':
      return createDefaultSudokuProxy();
    case 'shadowquic':
      return createDefaultShadowquicProxy();
    case 'trusttunnel':
      return createDefaultTrusttunnelProxy();
    case 'gost-relay':
      return createDefaultGostRelayProxy();
    case 'dns':
      return createDefaultDnsOutProxy();
    case 'rematch':
      return createDefaultRematchProxy();
    case 'masque':
      return createDefaultMasqueProxy();
    case 'tailscale':
      return createDefaultTailscaleProxy();
    case 'zerotier':
      return createDefaultZerotierProxy();
    case 'openvpn':
      return createDefaultOpenvpnProxy();
    default:
      return createDefaultVlessProxy();
  }
}

// Create a default proxy group
export function createDefaultProxyGroup(): ProxyGroup {
  return {
    id: generateId(),
    name: 'Proxy Group',
    type: 'select',
    config: {
      proxies: [],
      url: 'https://www.gstatic.com/generate_204',
      // mihomo's own defaults, written out so the form shows the same values
      // the config will actually run with.
      interval: 300,
      timeout: 5000,
      lazy: true,
    },
  };
}

// Create a default rule
export function createDefaultRule(): Rule {
  return {
    id: generateId(),
    type: 'DOMAIN-SUFFIX',
    payload: '',
    policy: 'DIRECT',
  };
}

// A new proxy provider, in the shape almost every real one has: an http
// subscription that tests its own nodes.
//
// Health checking is on by default, unlike most optional arguments here.
// Without it the provider's nodes have no latency behind them — a group's own
// `url` and `interval` reach only what it lists in `proxies:` — so a url-test
// group over a provider that does not test itself has nothing to sort by.
export function createDefaultProxyProvider(): ProxyProvider {
  return {
    type: 'http',
    url: '',
    interval: 3600,
    'health-check': {
      enable: true,
      url: 'https://www.gstatic.com/generate_204',
      interval: 300,
      timeout: 5000,
      lazy: true,
    },
  };
}

// The proxy-provider keys this app has a field for.
//
// mihomo takes a good deal more — `age-secret-key`, `override-expr`, per-node
// regex renames, and the transport flags left out of `override` — and a config
// that arrived carrying one keeps it. Both halves of the app consult this list
// to know what is theirs to rewrite and what is only theirs to carry: the
// exporter writes the rest back out untouched, and the edit form puts it back
// after a save. Without that, opening someone's provider and pressing Save
// would quietly delete the half of it there is no form for.
export const PROXY_PROVIDER_FIELDS = [
  'type',
  'url',
  'path',
  'interval',
  'proxy',
  'size-limit',
  'header',
  'health-check',
  'override',
  'filter',
  'exclude-filter',
  'exclude-type',
  'payload',
];

export const PROXY_PROVIDER_OVERRIDE_FIELDS = [
  'additional-prefix',
  'additional-suffix',
  'udp',
  'skip-cert-verify',
  'ip-version',
];

// Whatever is in `block` that `modelled` does not name.
export function unmodelledKeys(
  block: Record<string, any> | undefined,
  modelled: string[]
): Record<string, any> {
  const out: Record<string, any> = {};
  Object.entries(block || {}).forEach(([key, value]) => {
    if (modelled.includes(key)) return;
    if (value === undefined || value === null || value === '') return;
    out[key] = value;
  });
  return out;
}

// Coerces a value mihomo wants as a list into one.
//
// `alpn` is the case that matters: it was edited as a free-text box for a long
// time, so configs in storage — and hand-edits in the YAML pane — hold
// `h2,http/1.1` where a list belongs. Splitting on read means those keep
// working instead of exporting a string mihomo rejects.
export function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

export function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

// Helper function to set nested value in object using dot notation
export function setNestedValue(obj: any, path: string, value: any): any {
  const keys = path.split('.');
  const lastKey = keys.pop()!;
  const target = keys.reduce((current, key) => {
    if (!(key in current)) {
      current[key] = {};
    }
    return current[key];
  }, obj);
  target[lastKey] = value;
  return obj;
}

// A value a form control reports when its input has been cleared, as opposed
// to a real value someone typed. `undefined`/`null`/`''` all mean "unset".
export function isClearedValue(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

// Delete a nested key and then walk back up, removing any ancestor object that
// lost its last key. A block that was only present to hold the removed field
// disappears whole rather than leaving an empty `{}` behind.
export function deleteNestedValue(obj: any, path: string): any {
  const keys = path.split('.');
  const lastKey = keys.pop();
  if (lastKey === undefined) return obj;

  const parents: Array<{ container: Record<string, any>; key: string }> = [];
  let current: any = obj;
  for (const key of keys) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return obj;
    const child = current[key];
    parents.push({ container: current as Record<string, any>, key });
    current = child;
  }

  // The leaf itself may already be gone (an older draft held nothing here).
  if (current && typeof current === 'object' && lastKey in current) {
    delete current[lastKey];
  }

  for (let i = parents.length - 1; i >= 0; i -= 1) {
    const { container, key } = parents[i];
    const child = container[key];
    if (child && typeof child === 'object' && !Array.isArray(child) && Object.keys(child).length === 0) {
      delete container[key];
    } else {
      break;
    }
  }

  return obj;
}
