import type { FieldSchema } from '../../types';
import { dialFamilyFields, headerFields, tlsMaterialFields } from './common';

// TrustTunnel outbound. Fields per wiki.metacubex.one/config/proxies/trusttunnel/.
// The reuse trio is three-way exclusive: max-connections conflicts with
// max-streams; min-streams conflicts with max-streams.
export const trusttunnelProxyFields: FieldSchema[] = [
  ...headerFields('trusttunnel', 'TrustTunnel', 443),
  {
    fieldKey: 'config.username',
    label: 'proxy.jls.username.label',
    type: 'text',
    required: true,
    description: 'proxy.jls.username.description',
  },
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
    fieldKey: 'config.health-check',
    label: 'proxy.trusttunnel.healthCheck.label',
    type: 'boolean',
    default: true,
    description: 'proxy.trusttunnel.healthCheck.description',
  },
  {
    fieldKey: 'config.udp',
    label: 'proxy.common.udp.label',
    type: 'boolean',
    default: true,
    description: 'proxy.common.udp.description',
  },
  {
    fieldKey: 'config.quic',
    label: 'proxy.trusttunnel.quic.label',
    type: 'boolean',
    default: false,
    description: 'proxy.trusttunnel.quic.description',
  },
  {
    fieldKey: 'config.congestion-controller',
    label: 'proxy.tuic.congestionController.label',
    type: 'select',
    default: 'bbr',
    description: 'proxy.tuic.congestionController.description',
    showIf: { field: 'config.quic', operator: 'eq', value: true },
    options: [{ value: 'bbr', label: 'bbr' }],
  },
  {
    fieldKey: 'config.bbr-profile',
    label: 'proxy.hysteria2.bbrProfile.label',
    type: 'select',
    default: 'standard',
    description: 'proxy.hysteria2.bbrProfile.description',
    showIf: { field: 'config.quic', operator: 'eq', value: true },
    options: [
      { value: 'standard', label: 'standard' },
      { value: 'conservative', label: 'conservative' },
      { value: 'aggressive', label: 'aggressive' },
    ],
  },
  {
    fieldKey: 'config.max-connections',
    label: 'proxy.smux.maxConnections.label',
    type: 'number',
    min: 0,
    description: 'proxy.smux.maxConnections.description',
  },
  {
    fieldKey: 'config.min-streams',
    label: 'proxy.smux.minStreams.label',
    type: 'number',
    min: 0,
    description: 'proxy.smux.minStreams.description',
  },
  {
    fieldKey: 'config.max-streams',
    label: 'proxy.smux.maxStreams.label',
    type: 'number',
    min: 0,
    description: 'proxy.smux.maxStreams.description',
  },

  ...dialFamilyFields({ tcpOnlyOptions: false }),
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
    options: [{ value: 'h2', label: 'h2' }],
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
  ...tlsMaterialFields(),
];
