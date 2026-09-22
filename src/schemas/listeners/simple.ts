import type { SchemaSeed } from './dsl';
import { userListDef } from './blocks/users';
import { AUTH_ITEM_USERNAME_PASSWORD } from './blocks/users';
import { TLS_FIELDS } from './blocks/tls';

const APP_AUTH: SchemaSeed['fields'] = [
  userListDef('auth.users', 'server.field.users.label', AUTH_ITEM_USERNAME_PASSWORD, {
    descriptionKey: 'server.field.users.appAuthDescription',
  }),
];

export const HTTP_SEED: SchemaSeed = {
  kind: 'http',
  category: 'app-proxy',
  labelKey: 'server.proto.http.label',
  descriptionKey: 'server.proto.http.description',
  capability: { tls: true, mtls: true, ech: true },
  shareUri: 'unsupported',
  docUrl: docUrlOf('http'),
  fields: [...APP_AUTH, ...TLS_FIELDS],
};

export const SOCKS_SEED: SchemaSeed = {
  kind: 'socks',
  category: 'app-proxy',
  labelKey: 'server.proto.socks.label',
  descriptionKey: 'server.proto.socks.description',
  supportsUdpField: true,
  capability: { tls: true, mtls: true, ech: true, udp: true },
  shareUri: 'unsupported',
  docUrl: docUrlOf('socks'),
  fields: [
    {
      key: 'protocol.udp',
      labelKey: 'server.field.udp.label',
      descriptionKey: 'server.field.udp.description',
      section: 'protocol',
      type: 'boolean',
      default: true,
    },
    ...APP_AUTH,
    ...TLS_FIELDS,
  ],
};

export const MIXED_SEED: SchemaSeed = {
  kind: 'mixed',
  category: 'app-proxy',
  labelKey: 'server.proto.mixed.label',
  descriptionKey: 'server.proto.mixed.description',
  supportsUdpField: true,
  capability: { tls: true, mtls: true, ech: true, udp: true },
  shareUri: 'unsupported',
  docUrl: docUrlOf('mixed'),
  fields: [
    {
      key: 'protocol.udp',
      labelKey: 'server.field.udp.label',
      descriptionKey: 'server.field.udp.description',
      section: 'protocol',
      type: 'boolean',
      default: true,
    },
    ...APP_AUTH,
    ...TLS_FIELDS,
  ],
};

export const REDIR_SEED: SchemaSeed = {
  kind: 'redir',
  category: 'transparent',
  labelKey: 'server.proto.redir.label',
  descriptionKey: 'server.proto.redir.description',
  shareUri: 'unsupported',
  docUrl: docUrlOf('redirect'),
};

export const TPROXY_SEED: SchemaSeed = {
  kind: 'tproxy',
  category: 'transparent',
  labelKey: 'server.proto.tproxy.label',
  descriptionKey: 'server.proto.tproxy.description',
  supportsUdpField: true,
  capability: { udp: true },
  shareUri: 'unsupported',
  docUrl: docUrlOf('tproxy'),
  fields: [
    {
      key: 'protocol.udp',
      labelKey: 'server.field.udp.label',
      descriptionKey: 'server.field.udp.description',
      section: 'protocol',
      type: 'boolean',
      default: true,
    },
  ],
};

export const TUNNEL_SEED: SchemaSeed = {
  kind: 'tunnel',
  category: 'other',
  labelKey: 'server.proto.tunnel.label',
  descriptionKey: 'server.proto.tunnel.description',
  shareUri: 'unsupported',
  docUrl: docUrlOf('tunnel'),
  fields: [
    {
      key: 'protocol.network',
      labelKey: 'server.field.network.label',
      descriptionKey: 'server.field.network.description',
      section: 'protocol',
      type: 'multiselect',
      options: [
        { value: 'tcp', labelKey: 'server.field.network.tcp' },
        { value: 'udp', labelKey: 'server.field.network.udp' },
      ],
    },
    {
      key: 'protocol.target',
      labelKey: 'server.field.target.label',
      descriptionKey: 'server.field.target.description',
      section: 'protocol',
      type: 'text',
      required: true,
      placeholderKey: 'server.field.target.placeholder',
    },
  ],
};

function docUrlOf(name: string): string {
  return `https://wiki.metacubex.one/config/inbound/listeners/${name}/`;
}
