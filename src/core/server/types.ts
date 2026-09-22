export type ListenerType =
  | 'http'
  | 'socks'
  | 'mixed'
  | 'redir'
  | 'tproxy'
  | 'tun'
  | 'shadowsocks'
  | 'vmess'
  | 'vless'
  | 'trojan'
  | 'anytls'
  | 'snell'
  | 'mieru'
  | 'sudoku'
  | 'trusttunnel'
  | 'shadowquic'
  | 'hysteria2'
  | 'hysteria2-realm'
  | 'tunnel';

export type ListenerKind = ListenerType | 'tuic';

export type TuicVersion = 'v4' | 'v5';

export interface UserEntry {
  username?: string;
  uuid?: string;
  password?: string;
  alterId?: number;
  flow?: string;
  name?: string;
}

export type AuthMode = 'inherit' | 'list' | 'map' | 'token' | 'psk' | 'none';

export interface AuthSection {
  mode: AuthMode;
  users: UserEntry[];
  token: string[];
  psk?: string;
}

export interface CertSource {
  source: 'path' | 'pem';
  value: string;
}

export type ClientAuthType =
  | ''
  | 'request'
  | 'require-any'
  | 'verify-if-given'
  | 'require-and-verify';

export interface RealityFallbackLimit {
  afterBytes?: number;
  bytesPerSec?: number;
  burstBytesPerSec?: number;
}

export interface RealityConfig {
  dest: string;
  privateKey: string;
  shortIds: string[];
  serverNames: string[];
  // Profile metadata, not a mihomo key — the exporter never writes it. mihomo
  // derives the public half from private-key on its own, but share links need
  // the value too, so it is derived and kept here whenever the private key is
  // written (generated, pasted, or imported).
  publicKey?: string;
  maxTimeDifference?: number;
  proxy?: string;
  limitFallbackUpload?: RealityFallbackLimit;
  limitFallbackDownload?: RealityFallbackLimit;
}

export interface TlsSection {
  mode: 'none' | 'tls' | 'reality' | 'tlsmirror';
  certificate?: CertSource;
  privateKey?: CertSource;
  clientAuthType?: ClientAuthType;
  clientAuthCert?: CertSource;
  echKey?: string;
  reality?: RealityConfig;
  /** VMess-only tlsmirror-config payload (dest/primaryKey required by mihomo). */
  tlsmirror?: Record<string, unknown>;
}

export type XHttpMode = 'stream-one' | 'stream-up' | 'packet-up';
export type XHttpPlacement = 'queryInHeader' | 'cookie' | 'header' | 'query';
export type XHttpPaddingMethod = 'repeat-x' | 'tokenish';
export type XHttpUplinkMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type XHttpSessionPlacement = 'path' | 'query' | 'cookie' | 'header';
export type XHttpDataPlacement = 'body' | 'cookie' | 'header';

export interface XHttpOpts {
  path?: string;
  host?: string;
  mode?: XHttpMode;
  noSseHeader?: boolean;
  xPaddingBytes?: string;
  xPaddingObfsMode?: boolean;
  xPaddingKey?: string;
  xPaddingHeader?: string;
  xPaddingPlacement?: XHttpPlacement;
  xPaddingMethod?: XHttpPaddingMethod;
  uplinkHttpMethod?: XHttpUplinkMethod;
  sessionPlacement?: XHttpSessionPlacement;
  sessionKey?: string;
  sessionTable?: string;
  sessionLength?: string;
  seqPlacement?: XHttpSessionPlacement;
  seqKey?: string;
  uplinkDataPlacement?: XHttpDataPlacement;
  uplinkDataKey?: string;
  uplinkChunkSize?: number;
  scMaxBufferedPosts?: number;
  scStreamUpServerSecs?: string;
  scMaxEachPostBytes?: number;
}

export interface KcpCommon {
  mtu?: number;
  tti?: number;
  uplinkCapacity?: number;
  downlinkCapacity?: number;
  congestion?: boolean;
  writeBuffer?: number;
  readBuffer?: number;
  seed?: string;
  header?: '' | 'srtp' | 'utp' | 'wechat-video' | 'dtls' | 'wireguard';
}

export interface MkcpConfig extends KcpCommon {
  enable: boolean;
}

export interface MekyaConfig {
  enable: boolean;
  maxWriteSize?: number;
  maxWriteDurationMs?: number;
  maxSimultaneousWriteConnection?: number;
  packetWritingBuffer?: number;
  kcp?: KcpCommon;
}

export type KcpTunConfig = Record<string, unknown>;

export type TransportKind =
  | 'none'
  | 'tcp'
  | 'ws'
  | 'grpc'
  | 'xhttp'
  | 'mekya'
  | 'mkcp';

export interface TransportSection {
  kind: TransportKind;
  wsPath?: string;
  grpcServiceName?: string;
  xhttp?: XHttpOpts;
  mekyaConfig?: MekyaConfig;
  mkcpConfig?: MkcpConfig;
  kcpTun?: KcpTunConfig;
}

export interface ShadowTlsBlock {
  enable: boolean;
  version: 1 | 2 | 3;
  password?: string;
  users?: { name: string; password: string }[];
  handshake: { dest: string; proxy?: string };
}

export interface ResTlsBlock {
  enable: boolean;
  dest: string;
  password: string;
  restlsScript?: string;
  minRecordLen?: number;
  proxy?: string;
  rateLimit?: number;
}

export interface JlsBlock {
  enable: boolean;
  dest: string;
  sni?: string;
  alpn?: string[];
  proxy?: string;
  rateLimit?: number;
  users: { username: string; password: string }[];
}

export interface MuxBrutalOption {
  enabled: boolean;
  up: number;
  down: number;
}

export interface MuxOptionBlock {
  padding?: boolean;
  brutal?: MuxBrutalOption;
}

export interface SecurityBlocks {
  shadowTls?: ShadowTlsBlock;
  resTls?: ResTlsBlock;
  jls?: JlsBlock;
  muxOption?: MuxOptionBlock;
}

export interface ListenerIR {
  id: string;
  enabled: boolean;
  type: ListenerKind;
  tuicVersion?: TuicVersion;
  name: string;
  listen: string;
  port: string;
  routingMark?: number;
  rule?: string;
  proxy?: string;
  auth: AuthSection;
  tls: TlsSection;
  transport: TransportSection;
  protocol: Record<string, unknown>;
  security: SecurityBlocks;
  extensions: Record<string, unknown>;
}

// Server-side DNS shares the client document's DNS model outright.
//
// mihomo is one binary: the `dns:` section means the same thing whether the
// config targets a laptop or a relay box, so keeping two shapes here is how
// they drift. The form side reuses the client's schema module as well
// (see components/server/DnsTab); this alias only makes the sharing explicit.
// Kebab-case keys are native — the exporter writes them through unchanged.
export type ServerDnsIR = import('../ir/types').DnsConfig;

// ============= Outbounds & Rules =============
//
// mihomo has no `outbounds:` key — "出站" in a server scenario means the
// `proxies:` list plus the built-in policies (DIRECT/REJECT/REJECT-DROP/PASS/
// PASS-RULE/COMPATIBLE). A listener's `proxy` field and every rule target
// resolve names against exactly that table. The editor models the simple,
// runnable slice of that: three outbound kinds that cover the common server
// needs (direct egress, an upstream HTTP or SOCKS5 hop), and a curated rule
// subset. Anything beyond stays honest by being absent, not faked.

export type ServerOutboundKind = 'direct' | 'http' | 'socks5';

export interface ServerOutboundIR {
  id: string;
  enabled: boolean;
  type: ServerOutboundKind;
  name: string;
  /** http / socks5 only */
  server?: string;
  /** http / socks5 only */
  port?: number;
  username?: string;
  password?: string;
  /** socks5 only */
  udp?: boolean;
  /** socks5 only: dial the upstream over TLS */
  tls?: boolean;
}

// The rule types offered for new server rules. Existing rules imported from
// elsewhere keep whatever type they carry — the exporter writes them back
// verbatim rather than pretending they cannot exist.
export const SERVER_RULE_TYPES = [
  'DOMAIN',
  'DOMAIN-SUFFIX',
  'DOMAIN-KEYWORD',
  'DOMAIN-WILDCARD',
  'DOMAIN-REGEX',
  'GEOSITE',
  'GEOIP',
  'IP-CIDR',
  'IP-CIDR6',
  'SRC-IP-CIDR',
  'DST-PORT',
  'SRC-PORT',
  'IN-NAME',
  'IN-TYPE',
  'IN-USER',
  'NETWORK',
  'MATCH',
] as const;

export type ServerRuleType = (typeof SERVER_RULE_TYPES)[number];

export interface ServerRuleIR {
  id: string;
  type: string;
  payload: string;
  target: string;
  noResolve?: boolean;
}

// The server's own general section is the client's GeneralConfig verbatim —
// mihomo is one binary, so `mode`, `mixed-port`, `allow-lan`, `tun`, etc. mean
// the same on a relay box as on a laptop. The form reuses the client's
// `general` schema module; this alias makes that sharing explicit (same reason
// ServerDnsIR aliases DnsConfig above).
export type ServerGeneralIR = import('../ir/types').GeneralConfig;

export interface ServerConfigIR {
  schemaVersion: 1;
  general: ServerGeneralIR;
  dns: ServerDnsIR;
  listeners: ListenerIR[];
  outbounds?: ServerOutboundIR[];
  rules?: ServerRuleIR[];
  // Profile metadata, not a mihomo key: the IP addresses / domains of the
  // machine(s) that will actually run this config. The share links hang off
  // these — one link per address — so they live on the document rather than
  // on any single listener, and the exporter deliberately ignores them.
  servers?: string[];
}
