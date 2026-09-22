import type { FieldSchema } from '../../types';
import { dialFamilyFields, smuxFields, securityLayerFields } from './common';

// Trojan protocol schema
export const trojanProxyFields: FieldSchema[] = [
  {
    fieldKey: 'name',
    label: 'proxy.name.label',
    type: 'text',
    required: true,
    placeholder: 'Trojan-Node-01',
    description: 'proxy.name.description',
  },
  {
    fieldKey: 'type',
    label: 'proxy.type.label',
    type: 'select',
    default: 'trojan',
    required: true,
    options: [
      { value: 'trojan', label: 'Trojan' },
    ],
  },
  {
    fieldKey: 'server',
    label: 'proxy.server.label',
    type: 'text',
    required: true,
    placeholder: 'example.com',
    description: 'proxy.server.description',
  },
  {
    fieldKey: 'port',
    label: 'proxy.port.label',
    type: 'port',
    required: true,
    default: 443,
    min: 1,
    max: 65535,
  },
  {
    fieldKey: 'config.password',
    label: 'proxy.trojan.password.label',
    type: 'text',
    generator: 'password',
    required: true,
    placeholder: 'password',
    description: 'proxy.trojan.password.description',
  },
  {
    fieldKey: 'config.sni',
    label: 'proxy.trojan.sni.label',
    type: 'text',
    placeholder: 'example.com',
    description: 'proxy.trojan.sni.description',
  },
  {
    fieldKey: 'config.skip-cert-verify',
    label: 'proxy.trojan.skipCertVerify.label',
    type: 'boolean',
    default: false,
    description: 'proxy.trojan.skipCertVerify.description',
  },
  {
    fieldKey: 'config.network',
    label: 'proxy.trojan.network.label',
    type: 'select',
    default: 'tcp',
    description: 'proxy.trojan.network.description',
    options: [
      { value: 'tcp', label: 'TCP' },
      { value: 'ws', label: 'WebSocket' },
      { value: 'grpc', label: 'gRPC' },
    ],
  },
  {
    fieldKey: 'config.alpn',
    label: 'proxy.trojan.alpn.label',
    type: 'multiselect',
    description: 'proxy.trojan.alpn.description',
    options: [
      { value: 'h3', label: 'h3' },
      { value: 'h2', label: 'h2' },
      { value: 'http/1.1', label: 'http/1.1' },
    ],
  },
  {
    fieldKey: 'config.client-fingerprint',
    label: 'proxy.trojan.clientFingerprint.label',
    type: 'select',
    default: 'chrome',
    description: 'proxy.trojan.clientFingerprint.description',
    options: [
      { value: 'chrome', label: 'Chrome' },
      { value: 'firefox', label: 'Firefox' },
      { value: 'safari', label: 'Safari' },
      { value: 'ios', label: 'iOS' },
      { value: 'android', label: 'Android' },
      { value: 'edge', label: 'Edge' },
      { value: 'random', label: 'Random' },
    ],
  },
  // gRPC-specific fields
  {
    fieldKey: 'config.grpc-opts.grpc-service-name',
    label: 'proxy.trojan.grpc.serviceName.label',
    type: 'text',
    placeholder: 'GunService',
    description: 'proxy.trojan.grpc.serviceName.description',
    showIf: { field: 'config.network', operator: 'eq', value: 'grpc' },
  },
  // WebSocket-specific fields
  {
    fieldKey: 'config.ws-opts.path',
    label: 'proxy.trojan.ws.path.label',
    type: 'text',
    default: '/',
    placeholder: '/path',
    description: 'proxy.trojan.ws.path.description',
    showIf: { field: 'config.network', operator: 'eq', value: 'ws' },
  },
  {
    fieldKey: 'config.ws-opts.headers.Host',
    label: 'proxy.trojan.ws.host.label',
    type: 'text',
    placeholder: 'example.com',
    description: 'proxy.trojan.ws.host.description',
    showIf: { field: 'config.network', operator: 'eq', value: 'ws' },
  },

  // XTLS flows (legacy but still accepted by servers).
  {
    fieldKey: 'config.flow',
    label: 'proxy.trojan.flow.label',
    type: 'select',
    default: '',
    description: 'proxy.trojan.flow.description',
    options: [
      { value: '', label: 'proxy.vless.flow.none' },
      { value: 'xtls-rprx-direct', label: 'xtls-rprx-direct' },
      { value: 'xtls-rprx-origin', label: 'xtls-rprx-origin' },
    ],
  },
  {
    fieldKey: 'config.flow-show',
    label: 'proxy.trojan.flowShow.label',
    type: 'boolean',
    default: false,
    description: 'proxy.trojan.flowShow.description',
    showIf: { field: 'config.flow', operator: 'nin', value: ['', undefined] },
  },
  {
    fieldKey: 'config.udp',
    label: 'proxy.common.udp.label',
    type: 'boolean',
    default: true,
    description: 'proxy.common.udp.description',
  },
  {
    fieldKey: 'config.name-cert-verify',
    label: 'proxy.commonTls.nameCertVerify.label',
    type: 'text',
    placeholder: 'example.com',
    description: 'proxy.commonTls.nameCertVerify.description',
  },

  // Optional extra layers over TLS. The picker exists only in this form;
  // mihomo keys each layer by its own option block, so the selector value
  // itself never reaches the YAML (see UI_ONLY_CONFIG_KEYS).
  {
    fieldKey: 'config.trojanSecurityLayer',
    label: 'proxy.anytls.securityLayer.label',
    type: 'select',
    default: '',
    description: 'proxy.trojan.securityLayer.description',
    options: [
      { value: '', label: 'proxy.anytls.securityLayer.none' },
      { value: 'ech', label: 'ech' },
      { value: 'shadow-tls', label: 'shadow-tls' },
      { value: 'restls', label: 'restls' },
      { value: 'jls', label: 'jls' },
    ],
  },
  ...securityLayerFields('config.trojanSecurityLayer'),

  // trojan-go style inner Shadowsocks layer.
  {
    fieldKey: 'config.ss-opts.enabled',
    label: 'proxy.trojan.ssEnabled.label',
    type: 'boolean',
    default: false,
    description: 'proxy.trojan.ssEnabled.description',
  },
  {
    fieldKey: 'config.ss-opts.method',
    label: 'proxy.sudoku.aeadMethod.label',
    type: 'select',
    default: 'chacha20-ietf-poly1305',
    description: 'proxy.trojan.ssMethod.description',
    showIf: { field: 'config.ss-opts.enabled', operator: 'eq', value: true },
    options: [
      { value: 'chacha20-ietf-poly1305', label: 'chacha20-ietf-poly1305' },
      { value: 'aes-128-gcm', label: 'aes-128-gcm' },
      { value: 'aes-256-gcm', label: 'aes-256-gcm' },
    ],
  },
  {
    fieldKey: 'config.ss-opts.password',
    label: 'proxy.common.password.label',
    type: 'text',
    description: 'proxy.common.password.description',
    showIf: { field: 'config.ss-opts.enabled', operator: 'eq', value: true },
  },

  // sing-mux and the outbound dial family.
  ...smuxFields(),
  ...dialFamilyFields(),
];
