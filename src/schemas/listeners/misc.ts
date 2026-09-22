import type { ServerFieldDef, SchemaSeed } from './dsl';
import { userListDef } from './blocks/users';
import { AUTH_ITEM_USERNAME_PASSWORD } from './blocks/users';
import { TLS_FIELDS } from './blocks/tls';
import { MUX_FIELDS } from './blocks/securityBlocks';

export const MIERU_SEED: SchemaSeed = {
  kind: 'mieru',
  category: 'encrypted',
  labelKey: 'server.proto.mieru.label',
  descriptionKey: 'server.proto.mieru.description',
  capability: { udp: true },
  shareUri: 'supported',
  docUrl: docUrlOf('mieru'),
  fields: [
    {
      key: 'protocol.transport',
      labelKey: 'server.mieru.transport.label',
      section: 'protocol',
      type: 'select',
      default: 'TCP',
      options: [
        { value: 'TCP', label: 'TCP' },
        { value: 'UDP', label: 'UDP' },
      ],
    },
    userListDef('auth.users', 'server.field.users.label', AUTH_ITEM_USERNAME_PASSWORD),
    {
      key: 'protocol.traffic-pattern',
      labelKey: 'server.mieru.trafficPattern.label',
      descriptionKey: 'server.mieru.trafficPattern.description',
      section: 'protocol',
      type: 'text',
      level: 'advanced',
    },
    {
      key: 'protocol.user-hint-is-mandatory',
      labelKey: 'server.mieru.userHint.label',
      descriptionKey: 'server.mieru.userHint.description',
      section: 'protocol',
      type: 'boolean',
      level: 'advanced',
    },
  ],
};

const SUDOKU_TABLE_RE = /^(?=(?:[^x]*x){2}[^x]*$)(?=(?:[^p]*p){2}[^p]*$)(?=(?:[^v]*v){4}[^v]*$)[xpv]{8}$/;

export const SUDOKU_SEED: SchemaSeed = {
  kind: 'sudoku',
  category: 'encrypted',
  labelKey: 'server.proto.sudoku.label',
  descriptionKey: 'server.proto.sudoku.description',
  portMode: 'single',
  capability: {},
  shareUri: 'supported',
  docUrl: docUrlOf('sudoku'),
  fields: [
    {
      key: 'protocol.key',
      labelKey: 'server.sudoku.key.label',
      descriptionKey: 'server.sudoku.key.description',
      section: 'protocol',
      type: 'text',
      required: true,
    },
    {
      key: 'protocol.aead-method',
      labelKey: 'server.sudoku.aead.label',
      section: 'protocol',
      type: 'select',
      default: 'chacha20-poly1305',
      options: [
        { value: 'chacha20-poly1305', label: 'chacha20-poly1305' },
        { value: 'aes-128-gcm', label: 'aes-128-gcm' },
        { value: 'none', labelKey: 'server.sudoku.aead.none' },
      ],
    },
    number('protocol.padding-min', 'server.sudoku.paddingMin.label', { min: 0, max: 100 }),
    number('protocol.padding-max', 'server.sudoku.paddingMax.label', { min: 0, max: 100 }),
    {
      key: 'protocol.table-type',
      labelKey: 'server.sudoku.tableType.label',
      section: 'protocol',
      type: 'select',
      default: 'prefer_ascii',
      options: [
        { value: 'prefer_ascii', label: 'prefer_ascii' },
        { value: 'prefer_entropy', label: 'prefer_entropy' },
        { value: 'up_ascii_down_entropy', label: 'up_ascii_down_entropy' },
        { value: 'up_entropy_down_ascii', label: 'up_entropy_down_ascii' },
      ],
    },
    {
      key: 'protocol.custom-table',
      labelKey: 'server.sudoku.customTable.label',
      descriptionKey: 'server.sudoku.customTable.description',
      section: 'protocol',
      type: 'text',
      level: 'advanced',
    },
    {
      key: 'protocol.custom-tables',
      labelKey: 'server.sudoku.customTables.label',
      section: 'protocol',
      type: 'tag-list',
      level: 'advanced',
    },
    number('protocol.handshake-timeout', 'server.sudoku.handshakeTimeout.label', {
      min: 0,
      level: 'advanced',
    }),
    {
      key: 'protocol.enable-pure-downlink',
      labelKey: 'server.sudoku.pureDownlink.label',
      section: 'protocol',
      type: 'boolean',
      level: 'advanced',
    },
    {
      key: 'protocol.httpmask.disable',
      labelKey: 'server.sudoku.httpmaskDisable.label',
      section: 'protocol',
      type: 'boolean',
      level: 'advanced',
    },
    {
      key: 'protocol.httpmask.mode',
      labelKey: 'server.sudoku.httpmaskMode.label',
      section: 'protocol',
      type: 'select',
      level: 'advanced',
      default: 'legacy',
      options: [
        { value: 'legacy', label: 'legacy' },
        { value: 'stream', label: 'stream (split-stream)' },
        { value: 'poll', label: 'poll' },
        { value: 'auto', label: 'auto' },
        { value: 'ws', label: 'ws' },
      ],
    },
    textField('protocol.httpmask.path-root', 'server.sudoku.pathRoot.label', {
      level: 'advanced',
    }),
    textField('protocol.fallback', 'server.sudoku.fallback.label', {
      descriptionKey: 'server.sudoku.fallback.description',
      level: 'advanced',
      placeholderKey: 'server.sudoku.fallback.placeholder',
    }),
    ...MUX_FIELDS,
  ],
};

export const TRUSTTUNNEL_SEED: SchemaSeed = {
  kind: 'trusttunnel',
  category: 'quic',
  labelKey: 'server.proto.trusttunnel.label',
  descriptionKey: 'server.proto.trusttunnel.description',
  capability: { tls: true, mtls: true, ech: true, quic: true, udp: true },
  shareUri: 'supported',
  docUrl: docUrlOf('trusttunnel'),
  fields: [
    userListDef('auth.users', 'server.field.users.label', AUTH_ITEM_USERNAME_PASSWORD),
    {
      key: 'protocol.network',
      labelKey: 'server.field.network.label',
      descriptionKey: 'server.trusttunnel.network.description',
      section: 'protocol',
      type: 'multiselect',
      options: [
        { value: 'tcp', labelKey: 'server.field.network.tcp' },
        { value: 'udp', labelKey: 'server.field.network.udp' },
      ],
    },
    {
      key: 'protocol.bbr-profile',
      labelKey: 'server.quic.bbrProfile.label',
      section: 'protocol',
      type: 'select',
      level: 'advanced',
      options: [
        { value: '', labelKey: 'server.quic.bbrProfile.default' },
        { value: 'standard', label: 'standard' },
        { value: 'conservative', label: 'conservative' },
        { value: 'aggressive', label: 'aggressive' },
      ],
    },
    ...TLS_FIELDS,
  ],
};

const TUN_ADVANCED = 'advanced' as const;

function tag(key: string, labelKey: string): ServerFieldDef {
  return { key, labelKey, section: 'protocol', type: 'tag-list', level: TUN_ADVANCED };
}

function flag(key: string, labelKey: string): ServerFieldDef {
  return { key, labelKey, section: 'protocol', type: 'boolean', level: TUN_ADVANCED };
}

export const TUN_SEED: SchemaSeed = {
  kind: 'tun',
  category: 'transparent',
  labelKey: 'server.proto.tun.label',
  descriptionKey: 'server.proto.tun.description',
  portMode: 'none',
  shareUri: 'unsupported',
  docUrl: docUrlOf('tun'),
  fields: [
    {
      id: 'tun-stack',
      key: 'protocol.stack',
      labelKey: 'server.tun.stack.label',
      section: 'protocol',
      type: 'select',
      default: 'system',
      options: [
        { value: 'system', label: 'system' },
        { value: 'gvisor', label: 'gvisor' },
        { value: 'mixed', label: 'mixed' },
      ],
    },
    tag('protocol.dns-hijack', 'server.tun.dnsHijack.label'),
    flag('protocol.auto-route', 'server.tun.autoRoute.label'),
    flag('protocol.auto-detect-interface', 'server.tun.autoDetectInterface.label'),
    number('protocol.mtu', 'server.tun.mtu.label', { min: 0, level: TUN_ADVANCED }),
    tag('protocol.inet4-address', 'server.tun.inet4Address.label'),
    tag('protocol.inet6-address', 'server.tun.inet6Address.label'),
    flag('protocol.strict-route', 'server.tun.strictRoute.label'),
    tag('protocol.inet4-route-address', 'server.tun.inet4RouteAddress.label'),
    tag('protocol.inet6-route-address', 'server.tun.inet6RouteAddress.label'),
    flag('protocol.endpoint-independent-nat', 'server.tun.einat.label'),
    tag('protocol.include-uid', 'server.tun.includeUid.label'),
    tag('protocol.exclude-uid', 'server.tun.excludeUid.label'),
    tag('protocol.include-uid-range', 'server.tun.includeUidRange.label'),
    tag('protocol.exclude-uid-range', 'server.tun.excludeUidRange.label'),
    tag('protocol.include-mac-address', 'server.tun.includeMac.label'),
    tag('protocol.exclude-mac-address', 'server.tun.excludeMac.label'),
    tag('protocol.include-android-user', 'server.tun.includeAndroidUser.label'),
    tag('protocol.include-package', 'server.tun.includePackage.label'),
    tag('protocol.exclude-package', 'server.tun.excludePackage.label'),
  ],
};

function number(
  key: string,
  labelKey: string,
  extra?: Partial<ServerFieldDef>
): ServerFieldDef {
  return { key, labelKey, section: 'protocol', type: 'number', ...extra };
}

function textField(
  key: string,
  labelKey: string,
  extra?: Partial<ServerFieldDef>
): ServerFieldDef {
  return { key, labelKey, section: 'protocol', type: 'text', ...extra };
}

export function isValidSudokuCustomTable(value: string): boolean {
  return SUDOKU_TABLE_RE.test(value);
}

function docUrlOf(name: string): string {
  return `https://wiki.metacubex.one/config/inbound/listeners/${name}/`;
}
