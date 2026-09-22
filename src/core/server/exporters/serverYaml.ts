import yaml from 'js-yaml';
import type {
  AuthSection,
  ListenerIR,
  SecurityBlocks,
  ServerConfigIR,
  ServerDnsIR,
  ServerGeneralIR,
  ServerOutboundIR,
  ServerRuleIR,
  TlsSection,
  TransportSection,
} from '../types';
import { yamlTypeOf } from '../factory';

const CAMEL_EXCEPTIONS: Record<string, string> = {
  alterId: 'alterId',
};

export function camelToKebab(key: string): string {
  if (CAMEL_EXCEPTIONS[key]) return CAMEL_EXCEPTIONS[key];
  return key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function deepKebab(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepKebab);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[camelToKebab(key)] = deepKebab(child);
    }
    return out;
  }
  return value;
}

function dropBlanks(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropBlanks);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (child === undefined || child === null || child === '') continue;
      if (Array.isArray(child) && child.length === 0) continue;
      const cleaned = dropBlanks(child);
      if (
        cleaned !== null &&
        typeof cleaned === 'object' &&
        !Array.isArray(cleaned) &&
        Object.keys(cleaned as Record<string, unknown>).length === 0
      ) {
        continue;
      }
      out[key] = cleaned;
    }
    return out;
  }
  return value;
}

function authToYaml(auth: AuthSection): Record<string, unknown> {
  switch (auth.mode) {
    case 'list': {
      const users = auth.users
        .map((entry) => dropBlanks({ ...entry }))
        .filter((entry) => Object.keys(entry as Record<string, unknown>).length > 0);
      return users.length > 0 ? { users } : {};
    }
    case 'map': {
      const record: Record<string, string> = {};
      for (const entry of auth.users) {
        if (entry.username) record[entry.username] = entry.password ?? '';
      }
      return Object.keys(record).length > 0 ? { users: record } : {};
    }
    case 'token': {
      const token = auth.token.filter((entry) => entry !== '');
      return token.length > 0 ? { token } : {};
    }
    case 'psk':
      return auth.psk ? { psk: auth.psk } : {};
    case 'inherit':
    case 'none':
    default:
      return {};
  }
}

function tlsToYaml(tls: TlsSection): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  if (tls.mode === 'tls') {
    if (tls.certificate?.value) out.certificate = tls.certificate.value;
    if (tls.privateKey?.value) out['private-key'] = tls.privateKey.value;
  } else if (tls.mode === 'tlsmirror') {
    const mirror = tls.tlsmirror ? dropBlanks(deepKebab(tls.tlsmirror)) : {};
    if (Object.keys(mirror as Record<string, unknown>).length > 0) {
      out['tlsmirror-config'] = mirror;
    }
    return out;
  }

  if (tls.mode === 'tls') {
    if (tls.clientAuthType) out['client-auth-type'] = tls.clientAuthType;
    if (tls.clientAuthCert?.value) out['client-auth-cert'] = tls.clientAuthCert.value;
    if (tls.echKey) out['ech-key'] = tls.echKey;
  }

  if (tls.mode === 'reality' && tls.reality) {
    // The arrays guard with ?? : a Reality section can exist half-built (the
    // user switched modes and typed one field), and exporting must render
    // what is there instead of crashing on the keys nobody typed yet.
    const reality: Record<string, unknown> = dropBlanks({
      dest: tls.reality.dest,
      'private-key': tls.reality.privateKey,
      'short-id': (tls.reality.shortIds ?? []).filter((id) => id !== ''),
      'server-names': (tls.reality.serverNames ?? []).filter((name) => name !== ''),
      'max-time-difference': tls.reality.maxTimeDifference,
      proxy: tls.reality.proxy,
      'limit-fallback-upload': tls.reality.limitFallbackUpload
        ? deepKebab(dropBlanks(tls.reality.limitFallbackUpload))
        : undefined,
      'limit-fallback-download': tls.reality.limitFallbackDownload
        ? deepKebab(dropBlanks(tls.reality.limitFallbackDownload))
        : undefined,
    }) as Record<string, unknown>;
    out['reality-config'] = reality;
  }

  return out;
}

function transportToYaml(transport: TransportSection): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  switch (transport.kind) {
    case 'ws':
      if (transport.wsPath) out['ws-path'] = transport.wsPath;
      break;
    case 'grpc':
      if (transport.grpcServiceName) out['grpc-service-name'] = transport.grpcServiceName;
      break;
    case 'xhttp':
      if (transport.xhttp) {
        const xhttp = dropBlanks(deepKebab(transport.xhttp));
        if (Object.keys(xhttp as Record<string, unknown>).length > 0) {
          out['xhttp-config'] = xhttp;
        }
      }
      break;
    case 'mekya':
      out['mekya-config'] = dropBlanks(
        deepKebab({ enable: true, ...(transport.mekyaConfig ?? {}) })
      );
      break;
    case 'mkcp':
      out['mkcp-config'] = dropBlanks(
        deepKebab({ enable: true, ...(transport.mkcpConfig ?? {}) })
      );
      break;
    default:
      break;
  }

  if (transport.kcpTun) {
    const kcpTun = dropBlanks(deepKebab(transport.kcpTun));
    if (Object.keys(kcpTun as Record<string, unknown>).length > 0) {
      out['kcp-tun'] = kcpTun;
    }
  }

  return out;
}

function securityToYaml(security: SecurityBlocks): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  if (security.shadowTls?.enable) {
    out['shadow-tls'] = dropBlanks({
      enable: true,
      version: security.shadowTls.version,
      password: security.shadowTls.password,
      users: security.shadowTls.users?.filter((user) => user.name !== '' || user.password !== ''),
      handshake: dropBlanks(deepKebab(security.shadowTls.handshake)),
    });
  }

  if (security.resTls?.enable) {
    out['res-tls'] = dropBlanks(deepKebab(security.resTls));
  }

  if (security.jls?.enable) {
    out['jls-config'] = dropBlanks(deepKebab(security.jls));
  }

  if (security.muxOption) {
    out['mux-option'] = dropBlanks(deepKebab(security.muxOption));
  }

  return out;
}

export function listenerToYamlNode(listener: ListenerIR): Record<string, unknown> {
  const node: Record<string, unknown> = {
    name: listener.name,
    type: yamlTypeOf(listener.type),
  };

  if (listener.port !== '') node.port = normalizePortForExport(listener.port);
  node.listen = listener.listen;
  if (listener.routingMark !== undefined) node['routing-mark'] = listener.routingMark;
  if (listener.rule) node.rule = listener.rule;
  if (listener.proxy) node.proxy = listener.proxy;

  Object.assign(node, authToYaml(listener.auth));
  Object.assign(node, tlsToYaml(listener.tls));
  Object.assign(node, transportToYaml(listener.transport));
  Object.assign(node, securityToYaml(listener.security));

  for (const [key, value] of Object.entries(listener.protocol)) {
    if (value === undefined || value === null || value === '') continue;
    node[key] = value;
  }

  for (const [key, value] of Object.entries(listener.extensions)) {
    node[key] = value;
  }

  return node;
}

function normalizePortForExport(port: string): string {
  return port.trim();
}

// The DNS IR stores kebab-case keys natively (it shares the client document's
// DnsConfig), so export is a passthrough: skip empties, keep everything else
// in a stable order — enable first, then insertion order of the stored keys.
// The client exporter writes general keys in a fixed, documented order; the
// server shares the same IR shape, so the same order (and the same "emit only
// what is set" rule) applies here. TUN is emitted only when enabled, exactly
// like the client, so a bare default document stays minimal.
function generalToYaml(general: ServerGeneralIR): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  if (general['port']) out.port = general['port'];
  if (general['socks-port']) out['socks-port'] = general['socks-port'];
  if (general['redir-port']) out['redir-port'] = general['redir-port'];
  if (general['tproxy-port']) out['tproxy-port'] = general['tproxy-port'];
  if (general['mixed-port']) out['mixed-port'] = general['mixed-port'];

  if (general.mode) out.mode = general.mode;
  if (general['allow-lan'] !== undefined) out['allow-lan'] = general['allow-lan'];
  if (general['log-level']) out['log-level'] = general['log-level'];
  if (general.ipv6 !== undefined) out.ipv6 = general.ipv6;

  if (general['bind-address']) out['bind-address'] = general['bind-address'];
  if (general['external-controller']) out['external-controller'] = general['external-controller'];
  if (general.secret) out.secret = general.secret;

  if (general['external-ui']) out['external-ui'] = general['external-ui'];
  if (general['external-ui-name']) out['external-ui-name'] = general['external-ui-name'];
  if (general['external-ui-url']) out['external-ui-url'] = general['external-ui-url'];
  if (general['external-doh-server']) out['external-doh-server'] = general['external-doh-server'];

  if (general['find-process-mode']) out['find-process-mode'] = general['find-process-mode'];
  if (general['keep-alive-interval'] !== undefined) out['keep-alive-interval'] = general['keep-alive-interval'];
  if (general['keep-alive-idle'] !== undefined) out['keep-alive-idle'] = general['keep-alive-idle'];
  if (general['disable-keep-alive'] !== undefined) out['disable-keep-alive'] = general['disable-keep-alive'];
  if (general['tcp-concurrent'] !== undefined) out['tcp-concurrent'] = general['tcp-concurrent'];
  if (general['unified-delay'] !== undefined) out['unified-delay'] = general['unified-delay'];
  if (general['interface-name']) out['interface-name'] = general['interface-name'];
  if (general['routing-mark'] !== undefined) out['routing-mark'] = general['routing-mark'];
  if (general['global-client-fingerprint']) out['global-client-fingerprint'] = general['global-client-fingerprint'];

  if (general['global-ua']) out['global-ua'] = general['global-ua'];
  if (general['etag-support'] !== undefined) out['etag-support'] = general['etag-support'];

  if (general.tun?.enable) {
    const tun = general.tun;
    const block: Record<string, unknown> = { enable: true };
    const scalarKeys = [
      'stack',
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
    for (const k of scalarKeys) {
      if (tun[k] !== undefined) block[k] = tun[k];
    }
    const listKeys = [
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
    ] as const;
    for (const k of listKeys) {
      const v = tun[k];
      if (v && v.length > 0) block[k] = v;
    }
    for (const k of ['include-uid', 'exclude-uid'] as const) {
      const v = tun[k];
      if (v && v.length > 0) block[k] = (v as number[]).map((n) => Number(n));
    }
    for (const k of ['include-uid-range', 'exclude-uid-range'] as const) {
      const v = tun[k];
      if (v && v.length > 0) block[k] = v;
    }
    out.tun = block;
  }

  return out;
}

function dnsToYaml(dns: ServerDnsIR): Record<string, unknown> | undefined {
  if (!dns.enable) return undefined;
  const out: Record<string, unknown> = { enable: true };
  for (const [key, value] of Object.entries(dns)) {
    if (key === 'enable') continue;
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value as Record<string, unknown>).length === 0
    ) {
      continue;
    }
    out[key] = value;
  }
  return Object.keys(out).length > 1 ? out : { enable: true };
}

export class ServerYamlExporter {
  name = 'mihomo-server';
  version = '1.0.0';

  export(config: ServerConfigIR): string {
    const doc: Record<string, unknown> = {};

    // General comes first so a document always opens with the same
    // frame the client exporter writes (ports, mode, allow-lan, ...).
    Object.assign(doc, generalToYaml(config.general));

    const listeners = config.listeners
      .filter((listener) => listener.enabled)
      .map(listenerToYamlNode);
    if (listeners.length > 0) doc.listeners = listeners;

    const outbounds = (config.outbounds ?? [])
      .filter((outbound) => outbound.enabled)
      .map(outboundToYamlNode);
    // mihomo's key for user-defined outbounds is `proxies:` — the same key a
    // client config uses, because it is the same table of names rules and
    // listeners resolve against.
    if (outbounds.length > 0) doc.proxies = outbounds;

    const dns = dnsToYaml(config.dns);
    if (dns) doc.dns = dns;

    const rules = (config.rules ?? []).map(ruleToYamlString).filter(Boolean);
    if (rules.length > 0) doc.rules = rules;

    // An empty document is an empty preview: a bare `{}` is valid YAML but
    // reads as noise in a pane whose whole job is showing the file you are
    // about to deploy.
    if (Object.keys(doc).length === 0) return '';

    return yaml.dump(doc, {
      lineWidth: -1,
      noRefs: true,
    });
  }
}

// A custom outbound is written as one flat mapping; only the fields its kind
// actually takes are emitted, so a direct entry stays `{name, type}`.
export function outboundToYamlNode(outbound: ServerOutboundIR): Record<string, unknown> {
  const node: Record<string, unknown> = {
    name: outbound.name,
    type: outbound.type,
  };
  if (outbound.type === 'http' || outbound.type === 'socks5') {
    node.server = outbound.server;
    node.port = outbound.port;
    if (outbound.username) node.username = outbound.username;
    if (outbound.password) node.password = outbound.password;
  }
  if (outbound.type === 'socks5') {
    if (outbound.udp) node.udp = true;
    if (outbound.tls) node.tls = true;
  }
  return dropBlanks(node) as Record<string, unknown>;
}

// One rule, one line: TYPE,payload,target[,no-resolve]. MATCH carries no
// payload by definition.
export function ruleToYamlString(rule: ServerRuleIR): string | undefined {
  const target = rule.target?.trim();
  if (!target) return undefined;
  const type = rule.type?.trim();
  if (!type) return undefined;
  const parts =
    type === 'MATCH'
      ? [type, target]
      : [type, (rule.payload ?? '').trim(), target];
  if (rule.noResolve && type !== 'MATCH') parts.push('no-resolve');
  return parts.join(',');
}
