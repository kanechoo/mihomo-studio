import type { ServerFieldDef, SchemaSeed } from './dsl';
import { userListDef } from './blocks/users';
import { AUTH_ITEM_USERNAME_PASSWORD } from './blocks/users';
import { TLS_FIELDS } from './blocks/tls';

const CIPHERS = [
  { value: '2022-blake3-aes-128-gcm', label: '2022-blake3-aes-128-gcm' },
  { value: '2022-blake3-aes-256-gcm', label: '2022-blake3-aes-256-gcm' },
  { value: '2022-blake3-chacha20-poly1305', label: '2022-blake3-chacha20-poly1305' },
  { value: 'aes-128-gcm', label: 'aes-128-gcm' },
  { value: 'aes-192-gcm', label: 'aes-192-gcm' },
  { value: 'aes-256-gcm', label: 'aes-256-gcm' },
  { value: 'chacha20-ietf-poly1305', label: 'chacha20-ietf-poly1305' },
  { value: 'xchacha20-ietf-poly1305', label: 'xchacha20-ietf-poly1305' },
  { value: 'none', labelKey: 'server.ss.cipher.none' },
];

const SIMPLE_OBFS_SHOW = [
  { field: "protocol.simple-obfs.enable", operator: 'eq', value: true },
] as const;

const KCPTUN_PREFIX = 'transport.kcpTun';
const KCP_TUN_SHOW = [{ field: `${KCPTUN_PREFIX}.enable`, operator: 'eq', value: true }] as const;

function kcptunField(
  key: string,
  type: ServerFieldDef['type'],
  extra?: Partial<ServerFieldDef>
): ServerFieldDef {
  return {
    key: `${KCPTUN_PREFIX}.${key}`,
    labelKey: `server.kcptun.${key}.label`,
    section: 'transport',
    type,
    level: 'advanced',
    showIf: KCP_TUN_SHOW as unknown as ServerFieldDef['showIf'],
    ...extra,
  };
}

export const SHADOWSOCKS_SEED: SchemaSeed = {
  kind: 'shadowsocks',
  category: 'encrypted',
  labelKey: 'server.proto.shadowsocks.label',
  descriptionKey: 'server.proto.shadowsocks.description',
  supportsUdpField: true,
  capability: { udp: true },
  shareUri: 'supported',
  docUrl: docUrlOf('ss'),
  fields: [
    {
      key: 'protocol.cipher',
      labelKey: 'server.ss.cipher.label',
      section: 'protocol',
      type: 'select',
      required: true,
      default: 'aes-128-gcm',
      options: CIPHERS,
    },
    {
      key: 'protocol.password',
      labelKey: 'server.ss.password.label',
      descriptionKey: 'server.ss.password.description',
      section: 'protocol',
      type: 'secret-text',
      required: true,
      sensitive: true,
      // The 2022 ciphers demand key-shaped passwords — base64 of exactly 16 or
      // 32 random bytes, matching the cipher's key length. Legacy ciphers take
      // any password, so the generator follows the selected cipher.
      generator: 'password',
      generatorByOption: {
        field: 'protocol.cipher',
        kinds: {
          '2022-blake3-aes-128-gcm': 'ss2022-16',
          '2022-blake3-aes-256-gcm': 'ss2022-32',
          '2022-blake3-chacha20-poly1305': 'ss2022-32',
        },
      },
    },
    userListDef('security.jls.users', 'server.jls.users.label', AUTH_ITEM_USERNAME_PASSWORD, {
      showIf: [{ field: 'security.jls.enable', operator: 'eq', value: true }] as never,
      section: 'security' as const,
    }),
    {
      key: 'protocol.simple-obfs.enable',
      labelKey: 'server.sobfs.enable.label',
      section: 'protocol',
      type: 'boolean',
      level: 'advanced',
    },
    {
      key: 'protocol.simple-obfs.mode',
      labelKey: 'server.sobfs.mode.label',
      section: 'protocol',
      type: 'select',
      level: 'advanced',
      options: [
        { value: 'http', label: 'http' },
        { value: 'tls', label: 'tls' },
      ],
      showIf: SIMPLE_OBFS_SHOW as unknown as ServerFieldDef['showIf'],
    },
    {
      key: 'protocol.simple-obfs.host',
      labelKey: 'server.sobfs.host.label',
      section: 'protocol',
      type: 'text',
      level: 'advanced',
      showIf: SIMPLE_OBFS_SHOW as unknown as ServerFieldDef['showIf'],
    },
    {
      key: `${KCPTUN_PREFIX}.enable`,
      labelKey: 'server.kcptun.enable.label',
      section: 'transport',
      type: 'boolean',
      level: 'advanced',
    },
    kcptunField('key', 'secret-text', { sensitive: true }),
    kcptunField('crypt', 'select', {
      default: 'aes',
      options: ['aes', 'aes-128', 'aes-128-gcm', 'aes-192', 'salsa20', 'blowfish', 'twofish', 'cast5', '3des', 'tea', 'xtea', 'xor', 'none', 'null'].map((value) => ({ value, label: value })),
    }),
    kcptunField('mode', 'select', {
      default: 'fast',
      options: ['fast3', 'fast2', 'fast', 'normal', 'manual'].map((value) => ({ value, label: value })),
    }),
    kcptunField('conn', 'number', { min: 0 }),
    kcptunField('autoexpire', 'number', { min: 0 }),
    kcptunField('scavengettl', 'number', { min: 0 }),
    kcptunField('ratelimit', 'number', { min: 0 }),
    kcptunField('mtu', 'number', { min: 0 }),
    kcptunField('sndwnd', 'number', { min: 0 }),
    kcptunField('rcvwnd', 'number', { min: 0 }),
    kcptunField('datashard', 'number', { min: 0 }),
    kcptunField('parityshard', 'number', { min: 0 }),
    kcptunField('dscp', 'number', { min: 0 }),
    kcptunField('nocomp', 'boolean'),
    kcptunField('acknodelay', 'boolean'),
    kcptunField('nodelay', 'number', { min: 0 }),
    kcptunField('interval', 'number', { min: 0 }),
    kcptunField('resend', 'number', { min: 0 }),
    kcptunField('sockbuf', 'number', { min: 0 }),
    kcptunField('smuxver', 'number', { min: 1, max: 2 }),
    kcptunField('smuxbuf', 'number', { min: 0 }),
    kcptunField('framesize', 'number', { min: 0 }),
    kcptunField('streambuf', 'number', { min: 0 }),
    kcptunField('keepalive', 'number', { min: 0 }),
  ],
};

export const ANYTLS_SEED: SchemaSeed = {
  kind: 'anytls',
  category: 'encrypted',
  labelKey: 'server.proto.anytls.label',
  descriptionKey: 'server.proto.anytls.description',
  capability: { tls: true, mtls: true, ech: true },
  shareUri: 'supported',
  docUrl: docUrlOf('anytls'),
  fields: [
    userListDef('auth.users', 'server.field.users.label', AUTH_ITEM_USERNAME_PASSWORD),
    ...TLS_FIELDS,
    {
      key: 'protocol.padding-scheme',
      labelKey: 'server.anytls.paddingScheme.label',
      descriptionKey: 'server.anytls.paddingScheme.description',
      section: 'protocol',
      type: 'text',
      level: 'advanced',
    },
    {
      key: 'protocol.allow-insecure',
      labelKey: 'server.enc.allowInsecure.label',
      descriptionKey: 'server.enc.allowInsecure.description',
      section: 'protocol',
      type: 'boolean',
      level: 'advanced',
    },
  ],
};

const OBFS_SHOW = [
  { field: 'protocol.obfs-opts.mode', operator: 'nin', value: ['', undefined] },
] as const;

export const SNELL_SEED: SchemaSeed = {
  kind: 'snell',
  category: 'encrypted',
  labelKey: 'server.proto.snell.label',
  descriptionKey: 'server.proto.snell.description',
  supportsUdpField: true,
  capability: { udp: true },
  shareUri: 'supported',
  docUrl: docUrlOf('snell'),
  fields: [
    {
      key: 'auth.psk',
      labelKey: 'server.snell.psk.label',
      section: 'auth',
      type: 'secret-text',
      required: true,
      sensitive: true,
      generator: 'password',
    },
    {
      key: 'protocol.version',
      labelKey: 'server.snell.version.label',
      section: 'protocol',
      type: 'select',
      default: 4,
      options: [1, 2, 3, 4, 5].map((value) => ({ value, label: String(value) })),
    },
    {
      key: 'protocol.obfs-opts.mode',
      labelKey: 'server.snell.obfsMode.label',
      section: 'protocol',
      type: 'select',
      options: [
        { value: '', labelKey: 'server.snell.obfsMode.off' },
        { value: 'http', label: 'http' },
        { value: 'tls', label: 'tls' },
      ],
    },
    {
      key: 'protocol.obfs-opts.host',
      labelKey: 'server.snell.obfsHost.label',
      section: 'protocol',
      type: 'text',
      requiredWhen: [...OBFS_SHOW] as unknown as ServerFieldDef['requiredWhen'],
      showIf: OBFS_SHOW as unknown as ServerFieldDef['showIf'],
    },
  ],
};

function docUrlOf(name: string): string {
  return `https://wiki.metacubex.one/config/inbound/listeners/${name}/`;
}
