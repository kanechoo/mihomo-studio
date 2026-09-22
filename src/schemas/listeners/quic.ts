import type { ServerFieldDef, SchemaSeed } from './dsl';
import { userListDef } from './blocks/users';
import { AUTH_ITEM_USERNAME_PASSWORD } from './blocks/users';
import { TLS_FIELDS } from './blocks/tls';
import { MUX_FIELDS } from './blocks/securityBlocks';

const CONGESTION_OPTIONS = [
  { value: 'cubic', label: 'cubic' },
  { value: 'new_reno', label: 'new_reno' },
  { value: 'bbr', label: 'bbr' },
];

const BBR_PROFILE_FIELD: ServerFieldDef = {
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
};

function congestionField(defaultValue: string): ServerFieldDef {
  return {
    key: 'protocol.congestion-controller',
    labelKey: 'server.quic.cc.label',
    section: 'protocol',
    type: 'select',
    default: defaultValue,
    options: CONGESTION_OPTIONS,
  };
}

function numberField(
  key: string,
  labelKey: string,
  extra?: Partial<ServerFieldDef>
): ServerFieldDef {
  return {
    key,
    labelKey,
    section: 'protocol',
    type: 'number',
    ...extra,
  };
}

function textField(key: string, labelKey: string, extra?: Partial<ServerFieldDef>): ServerFieldDef {
  return { key, labelKey, section: 'protocol', type: 'text', ...extra };
}

function tuicSharedFields(): ServerFieldDef[] {
  return [
    congestionField('bbr'),
    { ...BBR_PROFILE_FIELD, showIf: [{ field: 'protocol.congestion-controller', operator: 'eq', value: 'bbr' }] },
    numberField('protocol.max-idle-time', 'server.tuic.maxIdleTime.label'),
    numberField('protocol.authentication-timeout', 'server.tuic.authTimeout.label'),
    {
      key: 'protocol.alpn',
      labelKey: 'server.field.alpn.label',
      section: 'protocol',
      type: 'tag-list',
    },
    numberField('protocol.max-udp-relay-packet-size', 'server.tuic.maxUdpPacket.label'),
    ...MUX_FIELDS,
  ];
}

export const TUIC_V4_SEED: SchemaSeed = {
  kind: 'tuic',
  tuicVersion: 'v4',
  category: 'quic',
  labelKey: 'server.proto.tuicv4.label',
  descriptionKey: 'server.proto.tuicv4.description',
  capability: { tls: true, mtls: true, ech: true, quic: true, udp: true },
  shareUri: 'supported',
  docUrl: docUrlOf('tuic-v4'),
  fields: [
    {
      key: 'auth.token',
      labelKey: 'server.tuic.tokenList.label',
      descriptionKey: 'server.tuic.tokenList.description',
      section: 'auth',
      type: 'tag-list',
    },
    ...TLS_FIELDS,
    ...tuicSharedFields(),
  ],
};

export const TUIC_V5_SEED: SchemaSeed = {
  kind: 'tuic',
  tuicVersion: 'v5',
  category: 'quic',
  labelKey: 'server.proto.tuicv5.label',
  descriptionKey: 'server.proto.tuicv5.description',
  capability: { tls: true, mtls: true, ech: true, quic: true, udp: true },
  shareUri: 'supported',
  docUrl: docUrlOf('tuic-v5'),
  fields: [
    userListDef('auth.users', 'server.tuic.usersMap.label', [
      {
        id: 'tuic-uuid',
        key: 'username',
        labelKey: 'server.fields.user.uuid',
        section: 'auth',
        type: 'text',
        generator: 'uuid',
      },
      {
        key: 'password',
        labelKey: 'server.fields.user.password',
        section: 'auth',
        type: 'text',
        sensitive: true,
        generator: 'password',
      },
    ]),
    ...TLS_FIELDS,
    ...tuicSharedFields(),
  ],
};

const REALM_SHOW = [
  { field: 'protocol.realm-opts.enable', operator: 'eq', value: true },
] as const;

export const HY2_FIELDS: ServerFieldDef[] = [
  {
    key: 'protocol.up',
    labelKey: 'server.hy2.up.label',
    descriptionKey: 'server.bandwidth.mbps.description',
    section: 'protocol',
    type: 'number',
    min: 0,
  },
  {
    key: 'protocol.down',
    labelKey: 'server.hy2.down.label',
    descriptionKey: 'server.bandwidth.mbps.description',
    section: 'protocol',
    type: 'number',
    min: 0,
  },
  {
    key: 'protocol.ignore-client-bandwidth',
    labelKey: 'server.hy2.ignoreClientBw.label',
    descriptionKey: 'server.hy2.ignoreClientBw.description',
    section: 'protocol',
    type: 'boolean',
    level: 'advanced',
  },
  {
    key: 'protocol.obfs',
    labelKey: 'server.hy2.obfs.label',
    descriptionKey: 'server.hy2.obfs.description',
    section: 'protocol',
    type: 'select',
    default: '',
    options: [
      { value: '', labelKey: 'server.hy2.obfs.off' },
      { value: 'salamander', label: 'salamander' },
    ],
  },
  {
    key: 'protocol.obfs-password',
    labelKey: 'server.hy2.obfsPassword.label',
    section: 'protocol',
    type: 'secret-text',
    sensitive: true,
    generator: 'password',
    requiredWhen: [
      { field: 'protocol.obfs', operator: 'eq', value: 'salamander' },
    ] as unknown as ServerFieldDef['requiredWhen'],
    showIf: [
      { field: 'protocol.obfs', operator: 'eq', value: 'salamander' },
    ] as unknown as ServerFieldDef['showIf'],
  },
  textField('protocol.masquerade', 'server.hy2.masquerade.label', {
    descriptionKey: 'server.hy2.masquerade.description',
    level: 'advanced',
    placeholderKey: 'server.hy2.masquerade.placeholder',
  }),
];

const HY2_REALM_FIELDS: ServerFieldDef[] = [
  {
    key: 'protocol.realm-opts.enable',
    labelKey: 'server.realm.enable.label',
    section: 'protocol',
    type: 'boolean',
    level: 'advanced',
  },
  textField('protocol.realm-opts.server-url', 'server.realm.serverUrl.label', {
    level: 'advanced',
    showIf: REALM_SHOW as unknown as ServerFieldDef['showIf'],
    placeholderKey: 'server.realm.serverUrl.placeholder',
  }),
  {
    key: 'protocol.realm-opts.token',
    labelKey: 'server.realm.token.label',
    section: 'protocol',
    type: 'secret-text',
    sensitive: true,
    level: 'advanced',
    generator: 'token',
    showIf: REALM_SHOW as unknown as ServerFieldDef['showIf'],
  },
  textField('protocol.realm-opts.realm-id', 'server.realm.realmId.label', {
    level: 'advanced',
    showIf: REALM_SHOW as unknown as ServerFieldDef['showIf'],
  }),
  {
    key: 'protocol.realm-opts.stun-servers',
    labelKey: 'server.realm.stunServers.label',
    section: 'protocol',
    type: 'tag-list',
    level: 'advanced',
    showIf: REALM_SHOW as unknown as ServerFieldDef['showIf'],
  },
  textField('protocol.realm-opts.proxy', 'server.field.proxy.label', {
    level: 'advanced',
    showIf: REALM_SHOW as unknown as ServerFieldDef['showIf'],
  }),
];

export const HYSTERIA2_SEED: SchemaSeed = {
  kind: 'hysteria2',
  category: 'quic',
  labelKey: 'server.proto.hysteria2.label',
  descriptionKey: 'server.proto.hysteria2.description',
  capability: { tls: true, mtls: true, ech: true, quic: true, udp: true },
  shareUri: 'supported',
  docUrl: docUrlOf('hysteria2'),
  fields: [
    userListDef(
      'auth.users',
      'server.field.users.label',
      AUTH_ITEM_USERNAME_PASSWORD,
      { descriptionKey: 'server.hy2.usersNote.description' }
    ),
    {
      key: 'protocol.alpn',
      labelKey: 'server.field.alpn.label',
      section: 'protocol',
      type: 'tag-list',
    },
    ...HY2_FIELDS,
    ...HY2_REALM_FIELDS,
    ...TLS_FIELDS,
    { ...BBR_PROFILE_FIELD },
  ],
};

export const HYSTERIA2_REALM_SEED: SchemaSeed = {
  kind: 'hysteria2-realm',
  category: 'quic',
  labelKey: 'server.proto.hysteria2realm.label',
  descriptionKey: 'server.proto.hysteria2realm.description',
  capability: { tls: true, mtls: true, ech: true, quic: true },
  shareUri: 'unsupported',
  docUrl: docUrlOf('hysteria2-realm'),
  fields: [
    textField('protocol.token', 'server.realm.bearerToken.label', {
      descriptionKey: 'server.realm.bearerToken.description',
      type: 'secret-text',
      sensitive: true,
    } as Partial<ServerFieldDef>),
    numberField('protocol.max-realms', 'server.realm.maxRealms.label', { min: 0 }),
    numberField('protocol.max-realms-per-ip', 'server.realm.maxRealmsPerIp.label', { min: 0 }),
    textField('protocol.trusted-proxy-header', 'server.realm.trustedProxyHeader.label', {
      level: 'advanced',
      placeholderKey: 'server.realm.trustedProxyHeader.placeholder',
    }),
    textField('protocol.realm-name-pattern', 'server.realm.namePattern.label', {
      descriptionKey: 'server.realm.namePattern.description',
      level: 'advanced',
    }),
    {
      key: 'protocol.alpn',
      labelKey: 'server.field.alpn.label',
      descriptionKey: 'server.realm.alpn.description',
      section: 'protocol',
      type: 'tag-list',
    },
    ...TLS_FIELDS,
  ],
};

export const SHADOWQUIC_SEED: SchemaSeed = {
  kind: 'shadowquic',
  category: 'quic',
  labelKey: 'server.proto.shadowquic.label',
  descriptionKey: 'server.proto.shadowquic.description',
  capability: { quic: true, udp: true },
  shareUri: 'supported',
  docUrl: docUrlOf('shadowquic'),
  fields: [
    userListDef('auth.users', 'server.field.users.label', AUTH_ITEM_USERNAME_PASSWORD),
    textField('protocol.jls-upstream.addr', 'server.sq.jlsAddr.label', {
      descriptionKey: 'server.sq.jlsAddr.description',
      level: 'advanced',
      placeholderKey: 'server.sq.jlsAddr.placeholder',
    }),
    textField('protocol.jls-upstream.sni', 'server.sq.jlsSni.label', {
      descriptionKey: 'server.sq.jlsSni.description',
      level: 'advanced',
    }),
    textField('protocol.jls-upstream.proxy', 'server.field.proxy.label', {
      level: 'advanced',
    }),
    numberField('protocol.jls-upstream.rate-limit', 'server.rateLimitShort.label', {
      level: 'advanced',
      min: 0,
    }),
    {
      key: 'protocol.alpn',
      labelKey: 'server.field.alpn.label',
      section: 'protocol',
      type: 'tag-list',
      level: 'advanced',
    },
    {
      key: 'protocol.quic-versions',
      labelKey: 'server.sq.versions.label',
      section: 'protocol',
      type: 'multiselect',
      options: [
        { value: 'v1', label: 'v1' },
        { value: 'v2', label: 'v2' },
      ],
    },
    {
      key: 'protocol.zero-rtt',
      labelKey: 'server.sq.zeroRtt.label',
      section: 'protocol',
      type: 'boolean',
    },
    congestionField('cubic'),
    { ...BBR_PROFILE_FIELD, showIf: [{ field: 'protocol.congestion-controller', operator: 'eq', value: 'bbr' }] },
    numberField('protocol.up', 'server.hy2.up.label', {
      descriptionKey: 'server.bandwidth.mbps.description',
    }),
    numberField('protocol.down', 'server.hy2.down.label', {
      descriptionKey: 'server.bandwidth.mbps.description',
    }),
    {
      key: 'protocol.ignore-client-bandwidth',
      labelKey: 'server.hy2.ignoreClientBw.label',
      descriptionKey: 'server.hy2.ignoreClientBw.description',
      section: 'protocol',
      type: 'boolean',
    },
    numberField('protocol.cwnd', 'server.sq.cwnd.label', { min: 0 }),
    numberField('protocol.max-idle-time', 'server.tuic.maxIdleTime.label', {}),
    numberField('protocol.max-datagram-frame-size', 'server.sq.maxDatagramFrame.label', { min: 0 }),
    numberField('protocol.recv-window-conn', 'server.sq.recvWindowConn.label', { min: 0 }),
    numberField('protocol.recv-window', 'server.sq.recvWindow.label', { min: 0 }),
    {
      key: 'protocol.disable-mtu-discovery',
      labelKey: 'server.sq.disableMtuDiscovery.label',
      section: 'protocol',
      type: 'boolean',
    },
  ],
};

function docUrlOf(name: string): string {
  return `https://wiki.metacubex.one/config/inbound/listeners/${name}/`;
}
