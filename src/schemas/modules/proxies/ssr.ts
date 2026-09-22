import type { FieldSchema } from '../../types';
import { dialFamilyFields, headerFields } from './common';

// ShadowsocksR outbound (legacy protocol, still documented). Fields per
// wiki.metacubex.one/config/proxies/ssr/.
export const ssrProxyFields: FieldSchema[] = [
  ...headerFields('ssr', 'ShadowsocksR', 443),
  {
    fieldKey: 'config.cipher',
    label: 'proxy.ss.cipher.label',
    type: 'select',
    required: true,
    default: 'aes-128-cfb',
    description: 'proxy.ssr.cipher.description',
    options: [
      'aes-128-cfb',
      'aes-192-cfb',
      'aes-256-cfb',
      'aes-128-ctr',
      'aes-192-ctr',
      'aes-256-ctr',
      'rc4-md5',
      'chacha20-ietf',
      'xchacha20',
    ].map((c) => ({ value: c, label: c })),
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
    fieldKey: 'config.protocol',
    label: 'proxy.ssr.protocol.label',
    type: 'select',
    required: true,
    default: 'origin',
    description: 'proxy.ssr.protocol.description',
    options: [
      'origin',
      'auth_sha1_v4',
      'auth_aes128_md5',
      'auth_aes128_sha1',
      'auth_chain_a',
      'auth_chain_b',
    ].map((p) => ({ value: p, label: p })),
  },
  {
    fieldKey: 'config.protocol-param',
    label: 'proxy.ssr.protocolParam.label',
    type: 'text',
    description: 'proxy.ssr.protocolParam.description',
  },
  {
    fieldKey: 'config.obfs',
    label: 'proxy.ssr.obfs.label',
    type: 'select',
    required: true,
    default: 'plain',
    description: 'proxy.ssr.obfs.description',
    options: [
      'plain',
      'http_simple',
      'http_post',
      'random_head',
      'tls1.2_ticket_auth',
      'tls1.2_ticket_fastauth',
    ].map((o) => ({ value: o, label: o })),
  },
  {
    fieldKey: 'config.obfs-param',
    label: 'proxy.ssr.obfsParam.label',
    type: 'text',
    placeholder: 'example.com',
    description: 'proxy.ssr.obfsParam.description',
  },
  {
    fieldKey: 'config.udp',
    label: 'proxy.common.udp.label',
    type: 'boolean',
    default: false,
    description: 'proxy.common.udp.description',
  },
  ...dialFamilyFields(),
];
