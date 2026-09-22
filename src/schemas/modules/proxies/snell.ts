import type { FieldSchema, ShowIfCondition } from '../../types';
import { dialFamilyFields, headerFields } from './common';

// Snell outbound. Fields per wiki.metacubex.one/config/proxies/snell/.
// The obfs block has four modes with mode-specific fields.
const OBFS_MODES = ['http', 'tls', 'shadow-tls', 'restls', 'jls'];

function obfsShowIf(mode: string): ShowIfCondition[] {
  return [
    { field: 'config.obfs-opts.mode', operator: 'eq', value: mode },
    // An obfs block nobody turned on says nothing.
    { field: 'config.obfsEnabled', operator: 'neq', value: false },
  ];
}

export const snellProxyFields: FieldSchema[] = [
  ...headerFields('snell', 'Snell', 44046),
  {
    fieldKey: 'config.psk',
    label: 'proxy.snell.psk.label',
    type: 'text',
    generator: 'password',
    required: true,
    placeholder: 'yourpsk',
    description: 'proxy.snell.psk.description',
  },
  {
    fieldKey: 'config.version',
    label: 'proxy.snell.version.label',
    type: 'select',
    default: 4,
    description: 'proxy.snell.version.description',
    // mihomo decodes these as integers; the option values stay numeric so the
    // stored config never holds a string the decoder rejects.
    options: [1, 2, 3, 4, 5].map((v) => ({ value: v, label: String(v) })),
  },
  {
    fieldKey: 'config.udp',
    label: 'proxy.common.udp.label',
    type: 'boolean',
    default: true,
    description: 'proxy.snell.udp.description',
  },
  {
    fieldKey: 'config.reuse',
    label: 'proxy.snell.reuse.label',
    type: 'boolean',
    default: false,
    description: 'proxy.snell.reuse.description',
  },
  {
    fieldKey: 'config.obfsEnabled',
    label: 'proxy.snell.obfsEnabled.label',
    type: 'boolean',
    default: false,
    description: 'proxy.snell.obfsEnabled.description',
  },
  {
    fieldKey: 'config.obfs-opts.mode',
    label: 'proxy.snell.obfsMode.label',
    type: 'select',
    default: 'http',
    description: 'proxy.snell.obfsMode.description',
    showIf: { field: 'config.obfsEnabled', operator: 'eq', value: true },
    options: OBFS_MODES.map((m) => ({ value: m, label: m })),
  },
  {
    fieldKey: 'config.client-fingerprint',
    label: 'proxy.commonTls.clientFingerprint.label',
    type: 'select',
    default: 'chrome',
    description: 'proxy.commonTls.clientFingerprint.description',
    showIf: { field: 'config.obfs-opts.mode', operator: 'in', value: ['shadow-tls', 'restls', 'jls'] },
    options: [
      { value: 'chrome', label: 'chrome' },
      { value: 'ios', label: 'ios' },
      { value: 'firefox', label: 'firefox' },
      { value: 'safari', label: 'safari' },
    ],
  },
  {
    fieldKey: 'config.obfs-opts.host',
    label: 'proxy.commonTls.host.label',
    type: 'text',
    required: true,
    placeholder: 'bing.com',
    description: 'proxy.commonTls.host.description',
    showIf: { field: 'config.obfs-opts.mode', operator: 'in', value: OBFS_MODES },
  },
  {
    fieldKey: 'config.obfs-opts.password',
    label: 'proxy.shadowTls.password.label',
    type: 'text',
    description: 'proxy.shadowTls.password.description',
    showIf: { field: 'config.obfs-opts.mode', operator: 'in', value: ['shadow-tls', 'restls'] },
  },
  {
    fieldKey: 'config.obfs-opts.version',
    label: 'proxy.shadowTls.version.label',
    type: 'select',
    default: 2,
    description: 'proxy.shadowTls.version.description',
    showIf: obfsShowIf('shadow-tls'),
    options: [1, 2, 3].map((v) => ({ value: v, label: String(v) })),
  },
  {
    fieldKey: 'config.obfs-opts.alpn',
    label: 'proxy.commonTls.alpn.label',
    type: 'multiselect',
    description: 'proxy.commonTls.alpn.description',
    showIf: { field: 'config.obfs-opts.mode', operator: 'in', value: ['shadow-tls', 'jls'] },
    options: [
      { value: 'h2', label: 'h2' },
      { value: 'http/1.1', label: 'http/1.1' },
    ],
  },
  {
    fieldKey: 'config.obfs-opts.version-hint',
    label: 'proxy.restls.versionHint.label',
    type: 'select',
    default: 'tls13',
    description: 'proxy.restls.versionHint.description',
    showIf: obfsShowIf('restls'),
    options: [
      { value: 'tls13', label: 'tls13' },
      { value: 'tls12', label: 'tls12' },
    ],
  },
  {
    fieldKey: 'config.obfs-opts.username',
    label: 'proxy.jls.username.label',
    type: 'text',
    required: true,
    description: 'proxy.jls.username.description',
    showIf: obfsShowIf('jls'),
  },
  ...dialFamilyFields(),
];
