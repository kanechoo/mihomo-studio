import type { FieldSchema } from '../../types';
import { dialFamilyFields, headerFields } from './common';

// AnyTLS outbound with its three optional security layers. Fields per
// wiki.metacubex.one/config/proxies/anytls/.
const SECURITY_LAYERS = ['shadow-tls', 'restls', 'jls'] as const;

function layerShowIf(layer: (typeof SECURITY_LAYERS)[number]) {
  return { field: 'config.anytlsSecurityLayer', operator: 'eq' as const, value: layer };
}

export const anytlsProxyFields: FieldSchema[] = [
  ...headerFields('anytls', 'AnyTLS'),
  {
    fieldKey: 'config.password',
    label: 'proxy.common.password.label',
    type: 'text',
    generator: 'password',
    required: true,
    placeholder: 'password',
    description: 'proxy.common.password.description',
  },
  {
    fieldKey: 'config.udp',
    label: 'proxy.common.udp.label',
    type: 'boolean',
    default: true,
    description: 'proxy.common.udp.description',
  },
  {
    fieldKey: 'config.sni',
    label: 'proxy.commonTls.sni.label',
    type: 'text',
    placeholder: 'example.com',
    description: 'proxy.commonTls.sni.description',
  },
  {
    fieldKey: 'config.alpn',
    label: 'proxy.commonTls.alpn.label',
    type: 'multiselect',
    description: 'proxy.commonTls.alpn.description',
    options: [
      { value: 'h2', label: 'h2' },
      { value: 'http/1.1', label: 'http/1.1' },
    ],
  },
  {
    fieldKey: 'config.skip-cert-verify',
    label: 'proxy.commonTls.skipCertVerify.label',
    type: 'boolean',
    default: false,
    description: 'proxy.commonTls.skipCertVerify.description',
  },
  {
    fieldKey: 'config.name-cert-verify',
    label: 'proxy.commonTls.nameCertVerify.label',
    type: 'text',
    placeholder: 'example.com',
    description: 'proxy.commonTls.nameCertVerify.description',
  },
  {
    fieldKey: 'config.client-fingerprint',
    label: 'proxy.commonTls.clientFingerprint.label',
    type: 'select',
    default: 'chrome',
    description: 'proxy.commonTls.clientFingerprint.description',
    options: [
      { value: 'chrome', label: 'chrome' },
      { value: 'firefox', label: 'firefox' },
      { value: 'safari', label: 'safari' },
      { value: 'ios', label: 'ios' },
      { value: 'random', label: 'random' },
    ],
  },
  {
    fieldKey: 'config.client-metadata',
    label: 'proxy.anytls.clientMetadata.label',
    type: 'text',
    description: 'proxy.anytls.clientMetadata.description',
  },
  {
    fieldKey: 'config.idle-session-check-interval',
    label: 'proxy.anytls.idleSessionCheckInterval.label',
    type: 'number',
    min: 0,
    description: 'proxy.anytls.idleSessionCheckInterval.description',
  },
  {
    fieldKey: 'config.idle-session-timeout',
    label: 'proxy.anytls.idleSessionTimeout.label',
    type: 'number',
    min: 0,
    description: 'proxy.anytls.idleSessionTimeout.description',
  },
  {
    fieldKey: 'config.min-idle-session',
    label: 'proxy.anytls.minIdleSession.label',
    type: 'number',
    min: 0,
    description: 'proxy.anytls.minIdleSession.description',
  },

  // Optional security layers — exactly one at a time.
  {
    fieldKey: 'config.anytlsSecurityLayer',
    label: 'proxy.anytls.securityLayer.label',
    type: 'select',
    default: '',
    description: 'proxy.anytls.securityLayer.description',
    options: [
      { value: '', label: 'proxy.anytls.securityLayer.none' },
      ...SECURITY_LAYERS.map((l) => ({ value: l, label: l })),
    ],
  },

  // shadow-tls layer
  {
    fieldKey: 'config.shadow-tls-opts.version',
    label: 'proxy.shadowTls.version.label',
    type: 'select',
    default: 3,
    description: 'proxy.shadowTls.version.description',
    showIf: layerShowIf('shadow-tls'),
    options: [1, 2, 3].map((v) => ({ value: v, label: String(v) })),
  },
  {
    fieldKey: 'config.shadow-tls-opts.password',
    label: 'proxy.shadowTls.password.label',
    type: 'text',
    required: true,
    description: 'proxy.shadowTls.password.description',
    showIf: layerShowIf('shadow-tls'),
  },

  // restls layer
  {
    fieldKey: 'config.restls-opts.password',
    label: 'proxy.common.password.label',
    type: 'text',
    required: true,
    description: 'proxy.common.password.description',
    showIf: layerShowIf('restls'),
  },
  {
    fieldKey: 'config.restls-opts.version-hint',
    label: 'proxy.restls.versionHint.label',
    type: 'select',
    default: 'tls13',
    description: 'proxy.restls.versionHint.description',
    showIf: layerShowIf('restls'),
    options: [
      { value: 'tls13', label: 'tls13' },
      { value: 'tls12', label: 'tls12' },
    ],
  },
  {
    fieldKey: 'config.restls-opts.restls-script',
    label: 'proxy.restls.script.label',
    type: 'text',
    description: 'proxy.restls.script.description',
    showIf: layerShowIf('restls'),
  },

  // jls layer
  {
    fieldKey: 'config.jls-opts.username',
    label: 'proxy.jls.username.label',
    type: 'text',
    required: true,
    description: 'proxy.jls.username.description',
    showIf: layerShowIf('jls'),
  },
  {
    fieldKey: 'config.jls-opts.password',
    label: 'proxy.jls.password.label',
    type: 'text',
    required: true,
    description: 'proxy.jls.password.description',
    showIf: layerShowIf('jls'),
  },
  ...dialFamilyFields(),
];
