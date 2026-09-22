import type { FieldSchema } from '../../types';
import { dialFamilyFields, headerFields, smuxFields } from './common';

// Shadowsocks outbound with the full official cipher list and all seven
// plugins. Fields per wiki.metacubex.one/config/proxies/ss/.
export const SS_CIPHERS = [
  'aes-128-gcm',
  'aes-192-gcm',
  'aes-256-gcm',
  'aes-128-cfb',
  'aes-192-cfb',
  'aes-256-cfb',
  'aes-128-ctr',
  'aes-192-ctr',
  'aes-256-ctr',
  'rc4-md5',
  'chacha20-ietf',
  'xchacha20',
  'chacha20-ietf-poly1305',
  'xchacha20-ietf-poly1305',
  '2022-blake3-aes-128-gcm',
  '2022-blake3-aes-256-gcm',
  '2022-blake3-chacha20-poly1305',
];

const PLUGINS = ['obfs', 'v2ray-plugin', 'shadow-tls', 'restls', 'jls', 'gost-plugin', 'kcptun'];

function pluginShowIf(plugin: string) {
  return { field: 'config.plugin', operator: 'eq' as const, value: plugin };
}

export const ssProxyFields: FieldSchema[] = [
  ...headerFields('ss', 'Shadowsocks', 443),
  {
    fieldKey: 'config.cipher',
    label: 'proxy.ss.cipher.label',
    type: 'select',
    required: true,
    default: 'aes-128-gcm',
    description: 'proxy.ss.cipher.description',
    options: SS_CIPHERS.map((c) => ({ value: c, label: c })),
  },
  {
    fieldKey: 'config.password',
    label: 'proxy.common.password.label',
    type: 'text',
    required: true,
    placeholder: 'password',
    description: 'proxy.common.password.description',
    generator: 'password',
    // The 2022 ciphers demand key-shaped passwords — base64 of exactly the
    // cipher's key length. The generator follows the selected cipher.
    generatorByOption: {
      field: 'config.cipher',
      kinds: {
        '2022-blake3-aes-128-gcm': 'ss2022-16',
        '2022-blake3-aes-256-gcm': 'ss2022-32',
        '2022-blake3-chacha20-poly1305': 'ss2022-32',
      },
    },
  },
  {
    fieldKey: 'config.udp',
    label: 'proxy.common.udp.label',
    type: 'boolean',
    default: true,
    description: 'proxy.common.udp.description',
  },
  {
    fieldKey: 'config.udp-over-tcp',
    label: 'proxy.ss.udpOverTcp.label',
    type: 'boolean',
    default: false,
    description: 'proxy.ss.udpOverTcp.description',
  },
  {
    fieldKey: 'config.plugin',
    label: 'proxy.ss.plugin.label',
    type: 'select',
    default: '',
    description: 'proxy.ss.plugin.description',
    options: [{ value: '', label: 'proxy.ss.plugin.none' }, ...PLUGINS.map((p) => ({ value: p, label: p }))],
  },

  // simple-obfs
  {
    fieldKey: 'config.plugin-opts.mode',
    label: 'proxy.ss.obfsMode.label',
    type: 'select',
    default: 'http',
    description: 'proxy.ss.obfsMode.description',
    showIf: pluginShowIf('obfs'),
    options: [
      { value: 'http', label: 'http' },
      { value: 'tls', label: 'tls' },
    ],
  },
  {
    fieldKey: 'config.plugin-opts.host',
    label: 'proxy.commonTls.host.label',
    type: 'text',
    placeholder: 'bing.com',
    description: 'proxy.commonTls.host.description',
    showIf: pluginShowIf('obfs'),
  },

  // v2ray-plugin
  {
    fieldKey: 'config.plugin-opts.mode',
    label: 'proxy.ss.v2rayMode.label',
    type: 'select',
    default: 'websocket',
    description: 'proxy.ss.v2rayMode.description',
    showIf: pluginShowIf('v2ray-plugin'),
    options: [{ value: 'websocket', label: 'websocket' }],
  },
  {
    fieldKey: 'config.plugin-opts.tls',
    label: 'proxy.commonTls.tls.label',
    type: 'boolean',
    default: false,
    description: 'proxy.commonTls.tls.description',
    showIf: pluginShowIf('v2ray-plugin'),
  },
  {
    fieldKey: 'config.plugin-opts.host',
    label: 'proxy.commonTls.host.label',
    type: 'text',
    placeholder: 'bing.com',
    description: 'proxy.commonTls.host.description',
    showIf: pluginShowIf('v2ray-plugin'),
  },
  {
    fieldKey: 'config.plugin-opts.path',
    label: 'proxy.transport.wsPath.label',
    type: 'text',
    default: '/',
    placeholder: '/path',
    description: 'proxy.transport.wsPath.description',
    showIf: pluginShowIf('v2ray-plugin'),
  },
  {
    fieldKey: 'config.plugin-opts.mux',
    label: 'proxy.ss.v2rayMux.label',
    type: 'boolean',
    default: false,
    description: 'proxy.ss.v2rayMux.description',
    showIf: pluginShowIf('v2ray-plugin'),
  },
  {
    fieldKey: 'config.plugin-opts.skip-cert-verify',
    label: 'proxy.commonTls.skipCertVerify.label',
    type: 'boolean',
    default: false,
    description: 'proxy.commonTls.skipCertVerify.description',
    showIf: [
      pluginShowIf('v2ray-plugin'),
      { field: 'config.plugin-opts.tls', operator: 'eq', value: true },
    ],
  },

  // shadow-tls
  {
    fieldKey: 'config.plugin-opts.host',
    label: 'proxy.commonTls.host.label',
    type: 'text',
    required: true,
    placeholder: 'cloud.tencent.com',
    description: 'proxy.commonTls.host.description',
    showIf: pluginShowIf('shadow-tls'),
  },
  {
    fieldKey: 'config.plugin-opts.password',
    label: 'proxy.common.password.label',
    type: 'text',
    generator: 'password',
    description: 'proxy.common.password.description',
    showIf: pluginShowIf('shadow-tls'),
  },
  {
    fieldKey: 'config.plugin-opts.version',
    label: 'proxy.shadowTls.version.label',
    type: 'select',
    default: '2',
    description: 'proxy.shadowTls.version.description',
    showIf: pluginShowIf('shadow-tls'),
    options: [
      { value: '1', label: '1' },
      { value: '2', label: '2' },
      { value: '3', label: '3' },
    ],
  },
  {
    fieldKey: 'config.client-fingerprint',
    label: 'proxy.commonTls.clientFingerprint.label',
    type: 'select',
    default: 'chrome',
    description: 'proxy.commonTls.clientFingerprint.description',
    showIf: { field: 'config.plugin', operator: 'in', value: ['shadow-tls', 'restls', 'jls'] },
    options: [
      { value: 'chrome', label: 'chrome' },
      { value: 'ios', label: 'ios' },
      { value: 'firefox', label: 'firefox' },
      { value: 'safari', label: 'safari' },
    ],
  },

  // restls
  {
    fieldKey: 'config.plugin-opts.host',
    label: 'proxy.commonTls.host.label',
    type: 'text',
    required: true,
    placeholder: 'www.microsoft.com',
    description: 'proxy.restls.hostHint.description',
    showIf: pluginShowIf('restls'),
  },
  {
    fieldKey: 'config.plugin-opts.password',
    label: 'proxy.common.password.label',
    type: 'text',
    generator: 'password',
    description: 'proxy.common.password.description',
    showIf: pluginShowIf('restls'),
  },
  {
    fieldKey: 'config.plugin-opts.version-hint',
    label: 'proxy.restls.versionHint.label',
    type: 'select',
    default: 'tls13',
    description: 'proxy.restls.versionHint.description',
    showIf: pluginShowIf('restls'),
    options: [
      { value: 'tls13', label: 'tls13' },
      { value: 'tls12', label: 'tls12' },
    ],
  },
  {
    fieldKey: 'config.plugin-opts.restls-script',
    label: 'proxy.restls.script.label',
    type: 'text',
    description: 'proxy.restls.script.description',
    showIf: pluginShowIf('restls'),
  },

  // jls
  {
    fieldKey: 'config.plugin-opts.host',
    label: 'proxy.commonTls.host.label',
    type: 'text',
    required: true,
    placeholder: 'www.example.com',
    description: 'proxy.commonTls.host.description',
    showIf: pluginShowIf('jls'),
  },
  {
    fieldKey: 'config.plugin-opts.username',
    label: 'proxy.jls.username.label',
    type: 'text',
    required: true,
    description: 'proxy.jls.username.description',
    showIf: pluginShowIf('jls'),
  },
  {
    fieldKey: 'config.plugin-opts.password',
    label: 'proxy.jls.password.label',
    type: 'text',
    generator: 'password',
    required: true,
    description: 'proxy.jls.password.description',
    showIf: pluginShowIf('jls'),
  },

  // gost-plugin
  {
    fieldKey: 'config.plugin-opts.mode',
    label: 'proxy.ss.v2rayMode.label',
    type: 'select',
    default: 'websocket',
    description: 'proxy.ss.v2rayMode.description',
    showIf: pluginShowIf('gost-plugin'),
    options: [{ value: 'websocket', label: 'websocket' }],
  },
  {
    fieldKey: 'config.plugin-opts.tls',
    label: 'proxy.commonTls.tls.label',
    type: 'boolean',
    default: false,
    description: 'proxy.commonTls.tls.description',
    showIf: pluginShowIf('gost-plugin'),
  },
  {
    fieldKey: 'config.plugin-opts.host',
    label: 'proxy.commonTls.host.label',
    type: 'text',
    placeholder: 'bing.com',
    description: 'proxy.commonTls.host.description',
    showIf: pluginShowIf('gost-plugin'),
  },
  {
    fieldKey: 'config.plugin-opts.path',
    label: 'proxy.transport.wsPath.label',
    type: 'text',
    default: '/',
    placeholder: '/path',
    description: 'proxy.transport.wsPath.description',
    showIf: pluginShowIf('gost-plugin'),
  },
  {
    fieldKey: 'config.plugin-opts.mux',
    label: 'proxy.ss.v2rayMux.label',
    type: 'boolean',
    default: false,
    description: 'proxy.ss.v2rayMux.description',
    showIf: pluginShowIf('gost-plugin'),
  },

  // kcptun — every documented knob, shown only when the plugin is selected.
  ...(
    [
      ['key', 'text', 'proxy.kcptun.key'],
      ['crypt', 'select', 'proxy.kcptun.crypt'],
      ['mode', 'select', 'proxy.kcptun.mode'],
      ['conn', 'number', 'proxy.kcptun.conn'],
      ['autoexpire', 'number', 'proxy.kcptun.autoexpire'],
      ['scavengettl', 'number', 'proxy.kcptun.scavengettl'],
      ['mtu', 'number', 'proxy.kcptun.mtu'],
      ['ratelimit', 'number', 'proxy.kcptun.ratelimit'],
      ['sndwnd', 'number', 'proxy.kcptun.sndwnd'],
      ['rcvwnd', 'number', 'proxy.kcptun.rcvwnd'],
      ['datashard', 'number', 'proxy.kcptun.datashard'],
      ['parityshard', 'number', 'proxy.kcptun.parityshard'],
      ['dscp', 'number', 'proxy.kcptun.dscp'],
      ['nocomp', 'boolean', 'proxy.kcptun.nocomp'],
      ['acknodelay', 'boolean', 'proxy.kcptun.acknodelay'],
      ['nodelay', 'number', 'proxy.kcptun.nodelay'],
      ['interval', 'number', 'proxy.kcptun.interval'],
      ['resend', 'number', 'proxy.kcptun.resend'],
      ['sockbuf', 'number', 'proxy.kcptun.sockbuf'],
      ['smuxver', 'number', 'proxy.kcptun.smuxver'],
      ['smuxbuf', 'number', 'proxy.kcptun.smuxbuf'],
      ['framesize', 'number', 'proxy.kcptun.framesize'],
      ['streambuf', 'number', 'proxy.kcptun.streambuf'],
      ['keepalive', 'number', 'proxy.kcptun.keepalive'],
    ] as Array<[string, 'text' | 'number' | 'boolean', string]>
  ).map<FieldSchema>(([key, type, keyPrefix]) => ({
    fieldKey: `config.plugin-opts.${key}`,
    label: `${keyPrefix}.label`,
    type,
    description: `${keyPrefix}.description`,
    showIf: pluginShowIf('kcptun'),
    ...(type === 'number' ? { min: 0 } : {}),
    ...(key === 'crypt'
      ? {
          default: 'aes',
          options: ['aes', 'aes-128', 'aes-128-gcm', 'aes-192', 'salsa20', 'blowfish', 'twofish', 'cast5', '3des', 'tea', 'xtea', 'xor', 'none', 'null'].map((v) => ({ value: v, label: v })),
        }
      : {}),
    ...(key === 'mode'
      ? {
          default: 'fast',
          options: ['fast3', 'fast2', 'fast', 'normal', 'manual'].map((v) => ({ value: v, label: v })),
        }
      : {}),
  })),

  {
    fieldKey: 'config.ip-version',
    label: 'proxy.ipVersion.label',
    type: 'select',
    default: 'dual',
    description: 'proxy.ipVersion.description',
    options: [
      { value: 'dual', label: 'dual' },
      { value: 'ipv4', label: 'ipv4' },
      { value: 'ipv6', label: 'ipv6' },
      { value: 'ipv4-prefer', label: 'ipv4-prefer' },
      { value: 'ipv6-prefer', label: 'ipv6-prefer' },
    ],
  },
  ...smuxFields(),
  ...dialFamilyFields(),
];
