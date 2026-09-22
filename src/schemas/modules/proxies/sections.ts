import type { FieldSchema, ProxySectionName, ShowIfCondition } from '../../types';
import { getNestedValue } from '../../../core/ir';

/**
 * Client proxy form sectioning.
 *
 * The editor renders each protocol as labelled sections instead of one flat
 * column. Field ownership is derived from `fieldKey` rather than repeated in
 * every protocol file: a `config.ws-opts.path` field is a WebSocket field no
 * matter which protocol lists it. Schema authors may still pin a field with
 * `section`/`level` when the mechanical answer would be wrong.
 */

export const PROXY_SECTION_ORDER: ProxySectionName[] = [
  'basic',
  'protocol',
  'tls',
  'reality',
  'security',
  'ws',
  'grpc',
  'h2',
  'xhttp',
  'download',
  'http',
  'mkcp',
  'mekya',
  'multiplexer',
  'dial',
  'plugin',
  'obfs',
  'portHopping',
  'quic',
  'realm',
  'httpmask',
  'ipstack',
  'amneziawg',
  'vpn',
];

export const PROXY_SECTION_TITLE_KEYS: Record<ProxySectionName, string> = {
  basic: 'proxy.section.basic',
  protocol: 'proxy.section.protocol',
  tls: 'proxy.section.tls',
  reality: 'proxy.section.reality',
  security: 'proxy.section.security',
  ws: 'proxy.section.ws',
  grpc: 'proxy.section.grpc',
  h2: 'proxy.section.h2',
  xhttp: 'proxy.section.xhttp',
  download: 'proxy.section.download',
  http: 'proxy.section.http',
  mkcp: 'proxy.section.mkcp',
  mekya: 'proxy.section.mekya',
  multiplexer: 'proxy.section.multiplexer',
  dial: 'proxy.section.dial',
  plugin: 'proxy.section.plugin',
  obfs: 'proxy.section.obfs',
  portHopping: 'proxy.section.portHopping',
  quic: 'proxy.section.quic',
  realm: 'proxy.section.realm',
  httpmask: 'proxy.section.httpmask',
  ipstack: 'proxy.section.ipstack',
  amneziawg: 'proxy.section.amneziawg',
  vpn: 'proxy.section.vpn',
};

export const BASIC_SECTIONS: ReadonlySet<ProxySectionName> = new Set<ProxySectionName>([
  'basic',
  'protocol',
  'tls',
  'reality',
]);

export const ADVANCED_SECTIONS: ReadonlySet<ProxySectionName> = new Set<ProxySectionName>(
  PROXY_SECTION_ORDER.filter((section) => !BASIC_SECTIONS.has(section))
);

const BLOCK_SECTIONS: Record<string, ProxySectionName> = {
  'ws-opts': 'ws',
  'grpc-opts': 'grpc',
  'h2-opts': 'h2',
  'xhttp-opts': 'xhttp',
  'http-opts': 'http',
  'mkcp-opts': 'mkcp',
  'mekya-opts': 'mekya',
  'reality-opts': 'reality',
  'ech-opts': 'security',
  'shadow-tls-opts': 'security',
  'restls-opts': 'security',
  'jls-opts': 'security',
  'plugin-opts': 'plugin',
  'ss-opts': 'plugin',
  'obfs-opts': 'obfs',
  'realm-opts': 'realm',
  httpmask: 'httpmask',
  'ip-stack': 'ipstack',
  'amnezia-wg-option': 'amneziawg',
  smux: 'multiplexer',
};

const TLS_SCALARS = new Set([
  'tls',
  'sni',
  'servername',
  'client-fingerprint',
  'skip-cert-verify',
  'name-cert-verify',
  'alpn',
  'disable-sni',
  'fingerprint',
  'certificate',
]);

const DIAL_SCALARS = new Set([
  'interface-name',
  'routing-mark',
  'dialer-proxy',
  'tfo',
  'mptcp',
  'ip-version',
]);

const QUIC_SCALARS = new Set([
  'congestion-controller',
  'cwnd',
  'bbr-profile',
  'quic-versions',
  'recv-window',
  'recv-window-conn',
  'max-open-streams',
  'max-datagram-frame-size',
  'disable-mtu-discovery',
  'initial-stream-receive-window',
  'max-stream-receive-window',
  'initial-connection-receive-window',
  'max-connection-receive-window',
  'max-udp-relay-packet-size',
  'udp-over-stream',
  'udp-over-stream-version',
  'zero-rtt',
  'reduce-rtt',
  'heartbeat-interval',
  'keep-alive-interval',
  'request-timeout',
  'fast-open',
]);

const VPN_SCALARS = new Set([
  'proto',
  'ca',
  'cert',
  'key',
  'data-ciphers',
  'auth',
  'comp-lzo',
  'tls-auth',
  'key-direction',
  'tls-crypt',
  'tls-crypt-v2',
  'ping',
  'ping-restart',
]);

function scalarSection(key: string, protocol: string): ProxySectionName {
  if (TLS_SCALARS.has(key)) return 'tls';
  if (DIAL_SCALARS.has(key)) return 'dial';
  if (key === 'mux' || key === 'multiplex') return 'multiplexer';
  if (key === 'max-connections' || key === 'min-streams' || key === 'max-streams') return 'multiplexer';
  if (key === 'protocol-param' || key === 'obfs-param') return 'plugin';
  if (key === 'ports' || key === 'hop-interval') return 'portHopping';
  if (QUIC_SCALARS.has(key)) return 'quic';
  if (VPN_SCALARS.has(key)) return 'vpn';

  if (key === 'cipher') return protocol === 'openvpn' ? 'vpn' : 'protocol';
  if (key === 'mtu') return protocol === 'openvpn' ? 'vpn' : 'protocol';
  if (key === 'handshake-timeout') return protocol === 'openvpn' ? 'vpn' : 'quic';
  if (key === 'private-key' || key === 'public-key') {
    return protocol === 'wireguard' || protocol === 'masque' ? 'protocol' : 'tls';
  }
  if (
    key === 'obfs' ||
    key === 'obfs-password' ||
    key === 'obfs-min-packet-size' ||
    key === 'obfs-max-packet-size' ||
    key === 'obfsEnabled'
  ) {
    return protocol === 'ssr' ? 'protocol' : 'obfs';
  }
  if (key === 'trojanSecurityLayer' || key === 'anytlsSecurityLayer') return 'security';
  if (key === 'up' || key === 'down') return protocol === 'shadowquic' ? 'quic' : 'protocol';

  return 'protocol';
}

/** Resolve the section a field belongs to, honouring any explicit override. */
export function resolveProxySection(field: FieldSchema, protocol: string): ProxySectionName {
  if (field.section) return field.section;

  const { fieldKey } = field;
  if (!fieldKey.startsWith('config.')) return 'basic';

  const rest = fieldKey.slice('config.'.length);
  const head = rest.split('.')[0];

  if (head in BLOCK_SECTIONS) return BLOCK_SECTIONS[head];
  return scalarSection(head, protocol);
}

export type ProxyFieldLevel = 'basic' | 'advanced';

/** Resolve the visibility tier, honouring any explicit override. */
export function resolveProxyLevel(field: FieldSchema, section: ProxySectionName): ProxyFieldLevel {
  if (field.level) return field.level;
  return BASIC_SECTIONS.has(section) ? 'basic' : 'advanced';
}

export interface ProxyFieldGroup {
  section: ProxySectionName;
  level: ProxyFieldLevel;
  fields: FieldSchema[];
}

function matchesCondition(condition: ShowIfCondition, values: Record<string, unknown>): boolean {
  const current = getNestedValue(values as any, condition.field);
  switch (condition.operator) {
    case 'eq':
      return current === condition.value;
    case 'neq':
      return current !== condition.value;
    case 'in':
      return Array.isArray(condition.value) && condition.value.includes(current);
    case 'nin':
      return Array.isArray(condition.value) && !condition.value.includes(current);
    default:
      return true;
  }
}

/** Mirror ConditionalField's showIf rule so empty sections are never drawn. */
export function isProxyFieldVisible(field: FieldSchema, values: Record<string, unknown>): boolean {
  if (!field.showIf) return true;
  const conditions = Array.isArray(field.showIf) ? field.showIf : [field.showIf];
  return conditions.every((condition) => matchesCondition(condition, values));
}

/**
 * Group visible fields into ordered, level-carrying sections. The group order
 * follows PROXY_SECTION_ORDER while retaining each field's array order within
 * its section.
 */
export function groupProxyFieldsBySection(
  fields: FieldSchema[],
  values: Record<string, unknown>,
  protocol: string
): ProxyFieldGroup[] {
  const byGroup = new Map<string, { section: ProxySectionName; level: ProxyFieldLevel; fields: FieldSchema[] }>();

  for (const field of fields) {
    if (!isProxyFieldVisible(field, values)) continue;
    const section = resolveProxySection(field, protocol);
    const level = resolveProxyLevel(field, section);
    const key = `${section}\u0000${level}`;
    const group = byGroup.get(key) ?? { section, level, fields: [] };
    group.fields.push(field);
    byGroup.set(key, group);
  }

  const groups: ProxyFieldGroup[] = [];
  for (const section of PROXY_SECTION_ORDER) {
    const basic = byGroup.get(`${section}\u0000basic`);
    const advanced = byGroup.get(`${section}\u0000advanced`);
    if (basic) groups.push(basic);
    if (advanced) groups.push(advanced);
  }
  return groups;
}
