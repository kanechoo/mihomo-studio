import type { FieldSchema } from '../../types';
import { dialFamilyFields, headerFields, tlsMaterialFields } from './common';

// SOCKS5 outbound, with optional TLS and mTLS. Fields per
// wiki.metacubex.one/config/proxies/socks/.
export const socks5ProxyFields: FieldSchema[] = [
  ...headerFields('socks5', 'SOCKS5', 1080),
  {
    fieldKey: 'config.username',
    label: 'proxy.http.username.label',
    type: 'text',
    description: 'proxy.http.username.description',
  },
  {
    fieldKey: 'config.password',
    label: 'proxy.common.password.label',
    type: 'text',
    generator: 'password',
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
    fieldKey: 'config.tls',
    label: 'proxy.commonTls.tls.label',
    type: 'boolean',
    default: false,
    description: 'proxy.commonTls.tls.description',
  },
  {
    fieldKey: 'config.skip-cert-verify',
    label: 'proxy.commonTls.skipCertVerify.label',
    type: 'boolean',
    default: false,
    description: 'proxy.commonTls.skipCertVerify.description',
    showIf: { field: 'config.tls', operator: 'eq', value: true },
  },
  {
    fieldKey: 'config.name-cert-verify',
    label: 'proxy.commonTls.nameCertVerify.label',
    type: 'text',
    placeholder: 'example.com',
    description: 'proxy.commonTls.nameCertVerify.description',
    showIf: { field: 'config.tls', operator: 'eq', value: true },
  },
  ...tlsMaterialFields(),
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
  ...dialFamilyFields(),
];
