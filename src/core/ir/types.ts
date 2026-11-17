// Core Intermediate Representation (IR) for Mihomo configuration
// This is the central data structure that decouples UI from export formats

export interface MihomoIR {
  version: string; // IR version for future migrations
  general: GeneralConfig;
  dns: DnsConfig;
  proxies: ProxyNode[];
  proxyProviders: Record<string, ProxyProvider>;
  proxyGroups: ProxyGroup[];
  rules: Rule[];
  ruleProviders: Record<string, RuleProvider>;
  // Phase-7 sections. All optional, so pre-existing persisted drafts (v4)
  // load unchanged — no migration is needed for any of these.
  hosts?: HostsEntry;
  ntp?: NtpConfig;
  profile?: ProfileConfig;
  experimental?: ExperimentalConfig;
  geodata?: GeodataConfig;
  sniffer?: SnifferConfig;
  // Top-level YAML keys this editor has no model for (listeners, tunnels,
  // sub-rules, script, ...). Preserved verbatim on import and re-emitted at
  // the end of the document on export — an unknown section from a newer
  // mihomo must survive a round-trip, never vanish silently.
  extensions?: Record<string, unknown>;
  // Inbound access control. Held as one object so the form can bind it
  // naturally; export writes the four official top-level YAML keys.
  accessControl?: {
    authentication?: string[]; // "user:pass" for http/socks/mixed inbounds
    'skip-auth-prefixes'?: string[];
    'lan-allowed-ips'?: string[];
    'lan-disallowed-ips'?: string[];
  };
}

// ============= General Configuration =============
export interface GeneralConfig {
  mode: 'rule' | 'global' | 'direct';
  'mixed-port'?: number;
  // The other documented inbound ports.
  port?: number;
  'socks-port'?: number;
  'redir-port'?: number;
  'tproxy-port'?: number;
  'allow-lan'?: boolean;
  'bind-address'?: string;
  'log-level'?: 'info' | 'warning' | 'error' | 'debug' | 'silent';
  ipv6?: boolean;
  'external-controller'?: string;
  'external-ui'?: string;
  'external-ui-name'?: string;
  'external-ui-url'?: string;
  'external-doh-server'?: string;
  secret?: string;
  tun?: TunConfig;

  // Runtime behaviour switches (official general page).
  'find-process-mode'?: 'always' | 'strict' | 'off';
  'keep-alive-interval'?: number;
  'keep-alive-idle'?: number;
  'disable-keep-alive'?: boolean;
  'tcp-concurrent'?: boolean;
  'unified-delay'?: boolean;
  'interface-name'?: string;
  'routing-mark'?: number;
  'global-client-fingerprint'?: string; // deprecated upstream; carried with a warning

  // External resources.
  'global-ua'?: string;
  'etag-support'?: boolean;
}

// Outbound interface binding for the RESTful API listener family.
export interface ExternalControllerTls {
  certificate?: string;
  'private-key'?: string;
}

// ============= Geo data =============
export interface GeodataConfig {
  'geodata-mode'?: boolean;
  'geodata-loader'?: 'standard' | 'memconservative';
  'geo-auto-update'?: boolean;
  'geo-update-interval'?: number; // hours
  'geox-url'?: {
    geoip?: string;
    geosite?: string;
    mmdb?: string;
    asn?: string;
  };
  'geosite-matcher'?: 'succinct' | 'mph';
}

// ============= NTP =============
export interface NtpConfig {
  enable: boolean;
  server?: string;
  port?: number;
  interval?: number; // minutes
  'write-to-system'?: boolean;
  'dialer-proxy'?: string;
}

// ============= Profile / cache =============
export interface ProfileConfig {
  'store-selected'?: boolean;
  'store-fake-ip'?: boolean;
}

// ============= Experimental =============
export interface ExperimentalConfig {
  'quic-go-disable-gso'?: boolean;
  'quic-go-disable-ecn'?: boolean;
  'dialer-ip4p-convert'?: boolean;
}

// hosts maps a hostname to one IP, a list of IPs, the special `lan` value, or
// another hostname as an alias — exactly the four official spellings.
export type HostsValue = string | string[];
export type HostsEntry = Record<string, HostsValue>;

export interface TunConfig {
  enable: boolean;
  stack?: 'system' | 'gvisor' | 'mixed';
  'dns-mode'?: 'disabled' | 'native' | 'hijack';
  'dns-hijack'?: string[];
  'auto-route'?: boolean;
  'auto-detect-interface'?: boolean;

  // Phase-8: the full documented TUN surface. All optional; export emits
  // whatever is set.
  device?: string;
  'auto-redirect'?: boolean;
  'strict-route'?: boolean;
  mtu?: number;
  gso?: boolean;
  'gso-max-size'?: number;
  'inet6-address'?: string;
  'udp-timeout'?: number;
  'iproute2-table-index'?: number;
  'iproute2-rule-index'?: number;
  'endpoint-independent-nat'?: boolean;
  'route-address-set'?: string[];
  'route-exclude-address-set'?: string[];
  'route-address'?: string[];
  'route-exclude-address'?: string[];
  'include-interface'?: string[];
  'exclude-interface'?: string[]; // conflicts with include-interface
  'include-uid'?: number[];
  'include-uid-range'?: string[];
  'exclude-uid'?: number[];
  'exclude-uid-range'?: string[];
  'include-mac-address'?: string[];
  'exclude-mac-address'?: string[];
  'include-android-user'?: string[];
  'include-package'?: string[];
  'exclude-package'?: string[];
}

// ============= DNS Configuration =============
export interface DnsConfig {
  enable: boolean;
  ipv6?: boolean;
  'enhanced-mode'?: 'fake-ip' | 'redir-host';
  'fake-ip-range'?: string;
  'fake-ip-filter'?: string[];
  'default-nameserver'?: string[];
  nameserver?: string[];
  fallback?: string[];
  'fallback-filter'?: {
    geoip?: boolean;
    'geoip-code'?: string;
    geosite?: string[]; // deprecated upstream; carried with a warning
    ipcidr?: string[];
    domain?: string[];
  };
  'nameserver-policy'?: Record<string, string | string[]>;

  // Phase-8: the remaining documented DNS surface.
  listen?: string;
  'prefer-h3'?: boolean;
  'cache-algorithm'?: 'lru' | 'arc';
  'fake-ip-range6'?: string;
  'fake-ip-filter-mode'?: 'blacklist' | 'whitelist' | 'rule';
  'fake-ip-ttl'?: number;
  'use-hosts'?: boolean;
  'use-system-hosts'?: boolean;
  'respect-rules'?: boolean;
  'proxy-server-nameserver'?: string[];
  'direct-nameserver'?: string[];
  'direct-nameserver-follow-policy'?: boolean;
  'fallback-lazy-query'?: boolean;
}

// ============= Sniffer =============
// `sniff` keys are camelCase in the IR and upper-cased on export. The three
// `ui-*-enabled` flags exist only so the form can express "sniff this
// protocol with default ports" (which YAML writes as an empty block); the
// exporter strips every ui-* key.
export interface SnifferConfig {
  enable: boolean;
  'force-dns-mapping'?: boolean;
  'parse-pure-ip'?: boolean;
  'override-destination'?: boolean;
  sniff?: Record<string, { ports?: string[]; 'override-destination'?: boolean }>;
  'force-domain'?: string[];
  'skip-domain'?: string[];
  'skip-src-address'?: string[];
  'skip-dst-address'?: string[];
}

// ============= Proxy Nodes =============
export interface ProxyNode {
  id: string; // Internal UI identifier (not exported to YAML)
  name: string;
  type:
    | 'vless'
    | 'trojan'
    | 'hysteria2'
    | 'tuic'
    | 'ss'
    | 'vmess'
    | 'direct'
    | 'http'
    | 'socks5'
    | 'snell'
    | 'ssr'
    | 'anytls'
    | 'hysteria'
    | 'wireguard'
    | 'ssh'
    | 'mieru'
    | 'sudoku'
    | 'shadowquic'
    | 'trusttunnel'
    | 'gost-relay'
    | 'dns'
    | 'rematch'
    | 'masque'
    | 'tailscale'
    | 'zerotier'
    | 'openvpn';
  // Optional: a `direct` outbound dials out locally and has no remote endpoint.
  server?: string;
  port?: number;
  // Protocol-specific configuration stored as key-value pairs
  // This allows for flexible schema extension without modifying the IR type
  config: Record<string, any>;
}

// Common VLESS config structure (for reference, actual data in config object)
export interface VlessConfig {
  uuid: string;
  flow?: string;
  network?: 'tcp' | 'ws' | 'grpc' | 'h2' | 'xhttp';
  tls?: boolean;
  security?: 'tls' | 'reality';
  'skip-cert-verify'?: boolean;
  servername?: string;
  'client-fingerprint'?: string;
  // REALITY-specific
  'reality-opts'?: {
    'public-key': string;
    'short-id'?: string;
  };
  // gRPC-specific
  'grpc-opts'?: {
    'grpc-service-name': string;
  };
  // WebSocket-specific
  'ws-opts'?: {
    path?: string;
    headers?: Record<string, string>;
  };
  // HTTP/2-specific. `host` is a list: mihomo accepts several and sends one of
  // them as the request host.
  'h2-opts'?: {
    host?: string[];
    path?: string;
  };
  // XHTTP-specific. A single `host`, unlike h2's list.
  //
  // Which HTTP version this speaks is not settled here but by `alpn`: h2 unless
  // the node offers h3 or http/1.1. `mode` is the shape of the transport —
  // `auto` lets mihomo pick between the one-connection and split forms.
  //
  // `download-settings` is the split-download half: a second XHTTP stream plus
  // a whole remote proxy, both editable in the form. Unknown future keys still
  // ride the index signature, as before.
  'xhttp-opts'?: {
    path?: string;
    host?: string;
    mode?: 'auto' | 'stream-one' | 'stream-up' | 'packet-up';
    'download-settings'?: VlessXhttpDownloadSettings;
    [key: string]: any;
  };
}

/** The `xhttp-opts.download-settings` block: a second XHTTP stream + proxy. */
export interface VlessXhttpDownloadSettings {
  path?: string;
  host?: string;
  headers?: Record<string, string>;
  'reuse-settings'?: {
    'max-concurrency'?: string;
    'max-connections'?: string;
    'c-max-reuse-times'?: string;
    'h-max-request-times'?: string;
    'h-max-reusable-secs'?: string;
    'h-keep-alive-period'?: number;
  };
  server?: string;
  port?: number;
  tls?: boolean;
  alpn?: string[];
  'skip-cert-verify'?: boolean;
  'name-cert-verify'?: string;
  fingerprint?: string;
  certificate?: string;
  'private-key'?: string;
  servername?: string;
  'client-fingerprint'?: string;
  'ech-opts'?: {
    enable?: boolean;
    config?: string;
    'query-server-name'?: string;
  };
  'shadow-tls-opts'?: {
    version?: number;
    password?: string;
  };
  'restls-opts'?: {
    password?: string;
    'version-hint'?: string;
    'restls-script'?: string;
  };
  'jls-opts'?: {
    username?: string;
    password?: string;
  };
  'reality-opts'?: {
    'public-key'?: string;
    'short-id'?: string;
  };
  [key: string]: any;
}

// ============= Proxy Providers =============

// A set of proxies mihomo fetches and keeps up to date itself, instead of one
// written out in `proxies:`.
//
// Nothing in the config can name the nodes inside: they arrive from someone
// else's subscription and change without the file changing. So a provider is
// only ever reached whole, through a group's `use:` — which is why its members
// cannot be offered in a member picker, named as a rule's policy, or checked
// for existence anywhere in this app. `filter` and `override` are the only way
// to say anything about them.
export interface ProxyProvider {
  type: 'http' | 'file' | 'inline';
  url?: string; // http only
  // file: where the list lives, and required. http: an optional cache path —
  // left out, mihomo names the file after the MD5 of the URL.
  path?: string;
  interval?: number; // http only, update interval in seconds
  proxy?: string; // http only, name of a proxy/group to download through
  'size-limit'?: number; // http only, max download size in bytes (0 = unlimited)
  header?: Record<string, string[]>; // http only, extra request headers
  // Latency testing for the nodes this provides. A group's own `url`/`interval`
  // deliberately do not reach them — mihomo health-checks only what a group
  // lists in `proxies:` — so a provider that does not test itself is a set of
  // nodes with no latency behind any of them.
  'health-check'?: ProxyProviderHealthCheck;
  // Rewrites applied to every node on its way out of the provider.
  override?: ProxyProviderOverride;
  filter?: string; // regex; keep only the nodes it matches
  'exclude-filter'?: string; // regex; drop the nodes it matches
  'exclude-type'?: string; // `|`-separated proxy types to drop. Not a regex.
  // inline only: the proxies themselves, shaped like `proxies:` entries.
  // mihomo also falls back to these when an http or file provider fails to parse.
  payload?: any[];
}

export interface ProxyProviderHealthCheck {
  enable: boolean;
  url?: string;
  interval?: number; // seconds
  timeout?: number; // milliseconds
  lazy?: boolean;
}

// The subscription belongs to someone else, so this is where a config says
// "these are all UDP-capable" or "prefix them so I can tell which list they
// came from". mihomo takes more here than is modelled — tfo, mptcp, up/down,
// per-node regex renames, yq expressions — deliberately left out as rare.
export interface ProxyProviderOverride {
  'additional-prefix'?: string;
  'additional-suffix'?: string;
  udp?: boolean;
  'skip-cert-verify'?: boolean;
  'ip-version'?: 'dual' | 'ipv4' | 'ipv6' | 'ipv4-prefer' | 'ipv6-prefer';
}

// ============= Proxy Groups =============
export interface ProxyGroup {
  id: string; // Internal UI identifier
  name: string;
  type: 'select' | 'url-test' | 'fallback' | 'load-balance' | 'relay';
  config: {
    proxies: string[]; // Proxy names or other group names
    // Proxy providers pulled in whole. A group with `use:` and nothing in
    // `proxies:` is perfectly ordinary — that is what a subscription-backed
    // group looks like — so "has no members" has to ask about both.
    use?: string[];
    url?: string; // Health check URL for url-test/fallback
    interval?: number; // Health check interval (seconds); 0 disables periodic testing
    timeout?: number; // Health check timeout (milliseconds)
    tolerance?: number; // Tolerance for url-test (ms)
    lazy?: boolean;
    // Member selected on startup. mihomo falls back to the first member when
    // this is empty or names something the group doesn't contain.
    'default-selected'?: string;
    'disable-udp'?: boolean;
    filter?: string; // Regex filter for proxy selection
    'exclude-filter'?: string;
    // Phase-8: remaining official group common fields.
    'exclude-type'?: string; // pipe-separated adapter types, no regex
    'expected-status'?: string; // e.g. "200/302/400-503"
    'max-failed-times'?: number;
    'empty-fallback'?: string; // proxy name (not a group) when the set is empty
    hidden?: boolean;
    icon?: string;
    'include-all-proxies'?: boolean;
    'include-all-providers'?: boolean;
    strategy?: 'consistent-hashing' | 'round-robin' | 'sticky-sessions'; // For load-balance
  };
}

// ============= Rules =============
export type RuleType =
  | 'DOMAIN' | 'DOMAIN-SUFFIX' | 'DOMAIN-KEYWORD' | 'DOMAIN-WILDCARD' | 'DOMAIN-REGEX'
  | 'GEOSITE'
  | 'IP-CIDR' | 'IP-CIDR6' | 'IP-SUFFIX' | 'IP-ASN' | 'GEOIP'
  | 'SRC-GEOIP' | 'SRC-IP-ASN' | 'SRC-IP-CIDR' | 'SRC-IP-SUFFIX'
  | 'DST-PORT' | 'SRC-PORT'
  | 'IN-PORT' | 'IN-TYPE' | 'IN-USER' | 'IN-NAME'
  | 'REMATCH-NAME'
  | 'PROCESS-PATH' | 'PROCESS-PATH-WILDCARD' | 'PROCESS-PATH-REGEX'
  | 'PROCESS-NAME' | 'PROCESS-NAME-WILDCARD' | 'PROCESS-NAME-REGEX'
  | 'UID' | 'NETWORK' | 'DSCP'
  | 'RULE-SET'
  | 'AND' | 'OR' | 'NOT' | 'SUB-RULE'
  | 'MATCH';

export interface Rule {
  id: string; // Internal UI identifier
  type: RuleType;
  payload: string; // Rule content (domain, IP, logic expression, etc.)
  policy: string; // Target proxy group name or DIRECT/REJECT/PASS
  'no-resolve'?: boolean;
  // `src` turns a target-IP rule into a source-IP match (official param).
  src?: boolean;
}

// ============= Rule Providers =============
export interface RuleProvider {
  type: 'http' | 'file' | 'inline';
  behavior: 'domain' | 'ipcidr' | 'classical';
  // `format` is optional; mihomo defaults to yaml. `mrs` is only valid for
  // domain/ipcidr behaviors and only for http/file providers.
  format?: 'yaml' | 'text' | 'mrs';
  url?: string; // http only
  path?: string; // file only; also an optional cache path for http providers
  interval?: number; // http only, update interval in seconds
  proxy?: string; // http only, name of a proxy/group to download through
  'size-limit'?: number; // http only, max download size in bytes (0 = unlimited)
  header?: Record<string, string[]>; // http only, extra request headers
  payload?: string[]; // inline only, the rules themselves
}
