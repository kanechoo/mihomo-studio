// Per-protocol Listener → client proxy converters.
//
// One converter per protocol that mihomo can serve on a listener AND dial as
// an outbound proxy. Each one spells out its whole field mapping — direct
// copies, renames, per-user expansion, derived values and the server-only
// fields it deliberately leaves behind — so the mapping matrix lives in
// reviewable code instead of in someone's memory of the docs.
import type { ListenerIR, UserEntry } from '../types';
import {
  securityKeys,
  smuxFromMuxOption,
  tlsKeys,
  transportKeys,
  Warnings,
  type ConvertContext,
} from './blocks';
import { nodeName, portNumberOf } from './common';

type Converter = (
  listener: ListenerIR,
  ctx: ConvertContext,
  user?: UserEntry
) => Record<string, unknown>;

function baseNode(
  listener: ListenerIR,
  type: string,
  ctx: ConvertContext,
  user?: UserEntry
): Record<string, unknown> {
  return {
    name: nodeName(listener, user),
    type,
    server: ctx.host,
    port: portNumberOf(listener),
  };
}

function merge(target: Record<string, unknown>, ...sources: (Record<string, unknown> | undefined)[]) {
  for (const source of sources) {
    if (!source) continue;
    for (const [key, value] of Object.entries(source)) target[key] = value;
  }
  return target;
}

const VLESS: Converter = (listener, ctx, user) => {
  const entry = user ?? listener.auth.users.find((candidate) => candidate.uuid);
  const node = baseNode(listener, 'vless', ctx, user);
  if (entry?.uuid) node.uuid = entry.uuid;
  if (entry?.flow) node.flow = entry.flow;

  merge(
    node,
    transportKeys(listener.transport, ctx),
    // vless/vmess spell the SNI `servername`; the explicit flag matters here
    // because plain-TCP VLESS is a legal configuration.
    tlsKeys(listener, ctx, { sniKey: 'servername', explicitTlsFlag: true }),
    securityKeys(listener, ctx)
  );

  const smux = smuxFromMuxOption(listener);
  if (smux) node.smux = smux;

  // Server-only by design: `decryption` configures the *server's* vless
  // encryption keypairs, and `allow-insecure` admits non-TLS clients — a
  // client-side skip-cert-verify would be a different statement entirely.
  return node;
};

const VMESS: Converter = (listener, ctx, user) => {
  const entry = user ?? listener.auth.users.find((candidate) => candidate.uuid);
  const node = baseNode(listener, 'vmess', ctx, user);
  if (entry?.uuid) node.uuid = entry.uuid;
  // The inbound takes no cipher; the outbound requires one. `auto` is the
  // documented default every VMess deployment negotiates down from.
  node.cipher = 'auto';
  // mihomo rejects a vmess outbound without alterId (`has unset fields`), so the
  // standard value 0 must be written, not dropped as an empty default.
  node.alterId = entry?.alterId ?? 0;

  merge(
    node,
    transportKeys(listener.transport, ctx),
    tlsKeys(listener, ctx, { sniKey: 'servername', explicitTlsFlag: true }),
    securityKeys(listener, ctx)
  );

  const smux = smuxFromMuxOption(listener);
  if (smux) node.smux = smux;
  return node;
};

const TROJAN: Converter = (listener, ctx, user) => {
  const entry = user ?? listener.auth.users.find((candidate) => candidate.password);
  const node = baseNode(listener, 'trojan', ctx, user);
  if (entry?.password) node.password = entry.password;

  // Trojan is always TLS: no `tls:` flag exists to write. The SNI still comes
  // from REALITY's camouflage list when there is one.
  merge(
    node,
    transportKeys(listener.transport, ctx),
    tlsKeys(listener, ctx, { sniKey: 'sni', explicitTlsFlag: false }),
    securityKeys(listener, ctx)
  );

  // trojan-go's shadowsocks layer keeps its shape across the boundary, only
  // changing block names.
  const ssOption = listener.protocol['ss-option'] as Record<string, unknown> | undefined;
  if (ssOption?.enabled === true) {
    const ssOpts: Record<string, unknown> = { enabled: true };
    if (ssOption.method) ssOpts.method = ssOption.method;
    if (ssOption.password) ssOpts.password = ssOption.password;
    node['ss-opts'] = ssOpts;
  }

  const smux = smuxFromMuxOption(listener);
  if (smux) node.smux = smux;
  return node;
};

const SHADOWSOCKS: Converter = (listener, ctx) => {
  const node = baseNode(listener, 'ss', ctx);
  const cipher = listener.protocol.cipher;
  const password = listener.protocol.password;
  if (typeof cipher === 'string' && cipher !== '') node.cipher = cipher;
  if (typeof password === 'string' && password !== '') node.password = password;
  if (listener.protocol.udp === true) node.udp = true;
  ctx.warnings.push(Warnings.credentials);

  // simple-obfs becomes the generic plugin form.
  const obfs = listener.protocol['simple-obfs'] as Record<string, unknown> | undefined;
  if (obfs?.enable === true) {
    node.plugin = 'obfs';
    const pluginOpts: Record<string, unknown> = {};
    if (typeof obfs.mode === 'string' && obfs.mode !== '') pluginOpts.mode = obfs.mode;
    if (typeof obfs.host === 'string' && obfs.host !== '') pluginOpts.host = obfs.host;
    node['plugin-opts'] = pluginOpts;
  }

  // The TLS wrappers appear as plugins on shadowsocks, not -opts blocks; each
  // needs the camouflage host the server only holds inside its handshake dest.
  const security = listener.security;
  if (security.shadowTls?.enable) {
    node.plugin = 'shadow-tls';
    const pluginOpts: Record<string, unknown> = {};
    const host = hostnameOf(security.shadowTls.handshake.dest);
    if (host) pluginOpts.host = host;
    if (security.shadowTls.version) pluginOpts.version = security.shadowTls.version;
    const password =
      security.shadowTls.password ||
      security.shadowTls.users?.find((candidate) => candidate.password !== '')?.password;
    if (password) pluginOpts.password = password;
    node['plugin-opts'] = pluginOpts;
  }
  if (security.resTls?.enable) {
    node.plugin = 'restls';
    const pluginOpts: Record<string, unknown> = {};
    const host = hostnameOf(security.resTls.dest);
    if (host) pluginOpts.host = host;
    if (security.resTls.password) pluginOpts.password = security.resTls.password;
    if (security.resTls.restlsScript) pluginOpts['restls-script'] = security.resTls.restlsScript;
    node['plugin-opts'] = pluginOpts;
    ctx.warnings.push(Warnings.restlsVersionHint);
  }
  if (security.jls?.enable) {
    node.plugin = 'jls';
    const pluginOpts: Record<string, unknown> = {};
    const host = hostnameOf(security.jls.dest);
    if (host) pluginOpts.host = host;
    const jlsUser = security.jls.users[0];
    if (jlsUser?.username) pluginOpts.username = jlsUser.username;
    if (jlsUser?.password) pluginOpts.password = jlsUser.password;
    if (security.jls.alpn && security.jls.alpn.length > 0) pluginOpts.alpn = security.jls.alpn;
    node['plugin-opts'] = pluginOpts;
  }

  // kcptun rides as a plugin whose options pass through almost verbatim.
  const kcpTun = listener.transport.kcpTun as Record<string, unknown> | undefined;
  if (kcpTun?.enable === true) {
    node.plugin = 'kcptun';
    const pluginOpts: Record<string, unknown> = {};
    const KCP_TUN_KEYS = [
      'key',
      'crypt',
      'mode',
      'conn',
      'autoexpire',
      'scavengettl',
      'ratelimit',
      'mtu',
      'sndwnd',
      'rcvwnd',
      'datashard',
      'parityshard',
      'dscp',
      'nocomp',
      'acknodelay',
      'nodelay',
      'interval',
      'resend',
      'sockbuf',
      'smuxver',
      'smuxbuf',
      'framesize',
      'streambuf',
      'keepalive',
    ];
    for (const key of KCP_TUN_KEYS) {
      if (kcpTun[key] !== undefined && kcpTun[key] !== '') pluginOpts[key] = kcpTun[key];
    }
    node['plugin-opts'] = pluginOpts;
  }

  return node;
};

function hostnameOf(dest: string): string {
  const trimmed = dest.trim();
  // [v6]:port — a naive split on ':' would return '['.
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']');
    return end > 0 ? trimmed.slice(1, end) : trimmed;
  }
  // Strip a single trailing :port from host:port / ipv4:port; a bare IPv6
  // literal (multiple colons) is returned whole rather than truncated.
  const first = trimmed.indexOf(':');
  if (first !== -1 && first === trimmed.lastIndexOf(':')) return trimmed.slice(0, first);
  return trimmed;
}

const ANYTLS: Converter = (listener, ctx, user) => {
  const entry = user ?? listener.auth.users.find((candidate) => candidate.password);
  const node = baseNode(listener, 'anytls', ctx, user);
  if (entry?.password) node.password = entry.password;

  merge(
    node,
    tlsKeys(listener, ctx, { sniKey: 'sni', explicitTlsFlag: false }),
    securityKeys(listener, ctx)
  );

  const paddingScheme = listener.protocol['padding-scheme'];
  if (typeof paddingScheme === 'string' && paddingScheme !== '') {
    node['padding-scheme'] = paddingScheme;
  }
  return node;
};

const TUIC_V5: Converter = (listener, ctx, user) => {
  const entry = user ?? listener.auth.users.find(
    (candidate) => candidate.username && candidate.password
  );
  const node = baseNode(listener, 'tuic', ctx, user);
  if (entry?.username) node.uuid = entry.username;
  if (entry?.password) node.password = entry.password;

  copyProtocolKeys(listener, node, [
    'congestion-controller',
    'bbr-profile',
    'alpn',
    'max-udp-relay-packet-size',
  ]);

  merge(node, tlsKeys(listener, ctx, { sniKey: 'sni', explicitTlsFlag: false }));

  // Server-only: max-idle-time / authentication-timeout tune the inbound
  // session lifecycle; mux-option has no smux surface on the TUIC outbound.
  return node;
};

const TUIC_V4: Converter = (listener, ctx) => {
  const node = baseNode(listener, 'tuic', ctx);
  const token = listener.auth.token[0];
  if (token) node.token = token;

  copyProtocolKeys(listener, node, [
    'congestion-controller',
    'bbr-profile',
    'alpn',
    'max-udp-relay-packet-size',
  ]);
  merge(node, tlsKeys(listener, ctx, { sniKey: 'sni', explicitTlsFlag: false }));
  return node;
};

const HYSTERIA2: Converter = (listener, ctx, user) => {
  const entry = user ?? listener.auth.users.find((candidate) => candidate.password);
  const node = baseNode(listener, 'hysteria2', ctx, user);
  if (entry?.password) node.password = entry.password;

  copyProtocolKeys(listener, node, [
    'up',
    'down',
    'obfs',
    'obfs-password',
    'alpn',
    'bbr-profile',
  ]);

  // Port ranges become hopping: the expression itself is the documented
  // client `ports` value, with the first port keeping the plain `port` field.
  // A realm-relayed node dials the relay instead of hopping ports — mihomo
  // rejects the combination outright, so the range yields to realm-opts.
  const portExpression = listener.port.trim();
  const realm = listener.protocol['realm-opts'] as Record<string, unknown> | undefined;
  const usingRealm = realm?.enable === true;
  if (/[-,]/.test(portExpression) && !usingRealm) node.ports = portExpression;

  if (usingRealm) {
    // The relay descriptor travels intact minus `proxy`, which names a proxy
    // on whichever machine dials — the client must pick its own.
    const realmOpts: Record<string, unknown> = { enable: true };
    for (const key of ['server-url', 'token', 'realm-id', 'stun-servers']) {
      if (realm[key] !== undefined && realm[key] !== '') realmOpts[key] = realm[key];
    }
    node['realm-opts'] = realmOpts;
  }

  merge(node, tlsKeys(listener, ctx, { sniKey: 'sni', explicitTlsFlag: false }));
  // Server-only: ignore-client-bandwidth, masquerade, up/down rate caps are
  // inbound policy. up/down DO travel above — they seed brutal negotiation.
  return node;
};

const SNELL: Converter = (listener, ctx) => {
  const node = baseNode(listener, 'snell', ctx);
  if (listener.auth.psk) node.psk = listener.auth.psk;
  ctx.warnings.push(Warnings.credentials);

  copyProtocolKeys(listener, node, ['version']);
  if (listener.protocol.udp === true) node.udp = true;

  const obfsMode = (listener.protocol['obfs-opts'] as Record<string, unknown> | undefined)?.mode;
  if (obfsMode === 'http' || obfsMode === 'tls') {
    const obfsHost = (listener.protocol['obfs-opts'] as Record<string, unknown>).host;
    node['obfs-opts'] = {
      mode: obfsMode,
      ...(typeof obfsHost === 'string' && obfsHost !== '' ? { host: obfsHost } : {}),
    };
  } else {
    // The TLS wrappers fold into obfs-opts under their own mode names.
    const security = listener.security;
    const obfsOpts: Record<string, unknown> = {};
    if (security.shadowTls?.enable) {
      const host = hostnameOf(security.shadowTls.handshake.dest);
      obfsOpts.mode = 'shadow-tls';
      if (host) obfsOpts.host = host;
      if (security.shadowTls.version) obfsOpts.version = security.shadowTls.version;
      const password =
        security.shadowTls.password ||
        security.shadowTls.users?.find((candidate) => candidate.password !== '')?.password;
      if (password) obfsOpts.password = password;
    } else if (security.resTls?.enable) {
      const host = hostnameOf(security.resTls.dest);
      obfsOpts.mode = 'restls';
      if (host) obfsOpts.host = host;
      if (security.resTls.password) obfsOpts.password = security.resTls.password;
      if (security.resTls.restlsScript) obfsOpts['restls-script'] = security.resTls.restlsScript;
      ctx.warnings.push(Warnings.restlsVersionHint);
    } else if (security.jls?.enable) {
      const host = hostnameOf(security.jls.dest);
      obfsOpts.mode = 'jls';
      if (host) obfsOpts.host = host;
      const jlsUser = security.jls.users[0];
      if (jlsUser?.username) obfsOpts.username = jlsUser.username;
      if (jlsUser?.password) obfsOpts.password = jlsUser.password;
    }
    if ('mode' in obfsOpts) node['obfs-opts'] = obfsOpts;
  }
  return node;
};

const MIERU: Converter = (listener, ctx, user) => {
  const entry = user ?? listener.auth.users.find((candidate) => candidate.password);
  const node = baseNode(listener, 'mieru', ctx, user);
  if (entry?.username) node.username = entry.username;
  if (entry?.password) node.password = entry.password;

  copyProtocolKeys(listener, node, ['transport', 'traffic-pattern']);
  // Server-only: user-hint-is-mandatory gates how strict the inbound is.
  return node;
};

const SUDOKU: Converter = (listener, ctx) => {
  const node = baseNode(listener, 'sudoku', ctx);

  copyProtocolKeys(listener, node, [
    'key',
    'aead-method',
    'padding-min',
    'padding-max',
    'table-type',
    'custom-table',
    'custom-tables',
    'httpmask',
    'enable-pure-downlink',
  ]);

  // When the server key half of an ED25519 pair, the client needs the other
  // half — a uuid key, by contrast, copies as-is. The document cannot tell
  // the two apart, so hand the distinction to the reader.
  ctx.warnings.push(Warnings.sudokuKey);

  // Server-only: handshake-timeout, fallback, mux-option.
  return node;
};

const SHADOWQUIC: Converter = (listener, ctx, user) => {
  const entry = user ?? listener.auth.users.find(
    (candidate) => candidate.username && candidate.password
  );
  const node = baseNode(listener, 'shadowquic', ctx, user);
  if (entry?.username) node.username = entry.username;
  if (entry?.password) node.password = entry.password;

  copyProtocolKeys(listener, node, [
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
  ]);

  // Server-only: jls-upstream (the inbound's own camouflage target),
  // max-idle-time, ignore-client-bandwidth.
  return node;
};

const TRUSTTUNNEL: Converter = (listener, ctx, user) => {
  const entry = user ?? listener.auth.users.find(
    (candidate) => candidate.username && candidate.password
  );
  const node = baseNode(listener, 'trusttunnel', ctx, user);
  if (entry?.username) node.username = entry.username;
  if (entry?.password) node.password = entry.password;

  // The listener's network list decides whether HTTP3 (and with it UDP
  // relay) exists at all; the outbound expresses that as quic + udp.
  const network = listener.protocol.network;
  const udpEnabled = Array.isArray(network) && network.includes('udp');
  if (udpEnabled) {
    node.quic = true;
    node.udp = true;
  }

  copyProtocolKeys(listener, node, ['congestion-controller', 'bbr-profile']);
  merge(node, tlsKeys(listener, ctx, { sniKey: 'sni', explicitTlsFlag: false }));
  return node;
};

/** Copies the named protocol keys when present and non-empty. */
function copyProtocolKeys(listener: ListenerIR, node: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = listener.protocol[key];
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    node[key] = value;
  }
}

export const CONVERTERS: Partial<Record<ListenerIR['type'], Converter>> = {
  vless: VLESS,
  vmess: VMESS,
  trojan: TROJAN,
  shadowsocks: SHADOWSOCKS,
  anytls: ANYTLS,
  tuic: (listener, ctx, user) =>
    listener.tuicVersion === 'v5' ? TUIC_V5(listener, ctx, user) : TUIC_V4(listener, ctx),
  hysteria2: HYSTERIA2,
  snell: SNELL,
  mieru: MIERU,
  sudoku: SUDOKU,
  shadowquic: SHADOWQUIC,
  trusttunnel: TRUSTTUNNEL,
};
