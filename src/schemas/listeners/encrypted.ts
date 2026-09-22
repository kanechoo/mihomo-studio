import type { ServerFieldDef, SchemaSeed } from './dsl';
import { userListDef } from './blocks/users';
import {
  AUTH_ITEM_USERNAME_UUID_FLOW,
  AUTH_ITEM_USERNAME_UUID_ALTERID,
  AUTH_ITEM_USERNAME_PASSWORD,
} from './blocks/users';
import {
  tlsModeField,
  TLS_BODY_FIELDS,
} from './blocks/tls';
import { REALITY_FIELDS } from './blocks/reality';
import {
  transportKindField,
  TRANSPORT_TCP_OPTION,
  TRANSPORT_WS_OPTION,
  TRANSPORT_GRPC_OPTION,
  TRANSPORT_XHTTP_OPTION,
  TRANSPORT_MEKYA_OPTION,
  TRANSPORT_MKCP_OPTION,
  WS_PATH_FIELD,
  GRPC_SERVICE_FIELD,
  XHTTP_FIELDS,
  MEKYA_FIELDS,
  MKCP_FIELDS,
} from './blocks/transport';

const REALITY_MODE_OPTION = { value: 'reality', labelKey: 'server.tls.mode.reality' };
const TLSMIRROR_MODE_OPTION = { value: 'tlsmirror', labelKey: 'server.tls.mode.tlsmirror' };

const ALLOW_INSECURE_FIELD: ServerFieldDef = {
  key: 'protocol.allow-insecure',
  labelKey: 'server.enc.allowInsecure.label',
  descriptionKey: 'server.enc.allowInsecure.description',
  section: 'protocol',
  type: 'boolean',
  level: 'advanced',
};

const DECRYPTION_FIELD: ServerFieldDef = {
  key: 'protocol.decryption',
  labelKey: 'server.vless.decryption.label',
  descriptionKey: 'server.vless.decryption.description',
  section: 'protocol',
  type: 'text',
  level: 'advanced',
};

const TLSMIRROR_SHOW = [
  { field: 'tls.mode', operator: 'eq', value: 'tlsmirror' },
] as const;

export const TLSMIRROR_FIELDS: ServerFieldDef[] = [
  {
    key: 'tls.tlsmirror.dest',
    labelKey: 'server.tlsmirror.dest.label',
    section: 'tls',
    type: 'text',
    placeholderKey: 'server.reality.dest.placeholder',
    showIf: TLSMIRROR_SHOW as unknown as ServerFieldDef['showIf'],
  },
  {
    key: 'tls.tlsmirror.primary-key',
    labelKey: 'server.tlsmirror.primaryKey.label',
    descriptionKey: 'server.tlsmirror.primaryKey.description',
    section: 'tls',
    type: 'secret-text',
    sensitive: true,
    showIf: TLSMIRROR_SHOW as unknown as ServerFieldDef['showIf'],
  },
  {
    key: 'tls.tlsmirror.proxy',
    labelKey: 'server.field.proxy.label',
    section: 'tls',
    type: 'text',
    level: 'advanced',
    showIf: TLSMIRROR_SHOW as unknown as ServerFieldDef['showIf'],
  },
  {
    key: 'tls.tlsmirror.sequence-watermarking-enabled',
    labelKey: 'server.tlsmirror.watermark.label',
    section: 'tls',
    type: 'boolean',
    level: 'advanced',
    showIf: TLSMIRROR_SHOW as unknown as ServerFieldDef['showIf'],
  },
];


const SS_OPTION_SHOW = [
  { field: 'protocol.ss-option.enabled', operator: 'eq', value: true },
] as const;

export const SS_OPTION_FIELDS: ServerFieldDef[] = [
  {
    key: 'protocol.ss-option.enabled',
    labelKey: 'server.trojan.ssOption.label',
    descriptionKey: 'server.trojan.ssOption.description',
    section: 'protocol',
    type: 'boolean',
  },
  {
    key: 'protocol.ss-option.method',
    labelKey: 'server.trojan.ssMethod.label',
    section: 'protocol',
    type: 'select',
    default: 'aes-128-gcm',
    options: [
      { value: 'aes-128-gcm', label: 'aes-128-gcm' },
      { value: 'aes-256-gcm', label: 'aes-256-gcm' },
      { value: 'chacha20-ietf-poly1305', label: 'chacha20-ietf-poly1305' },
    ],
    showIf: SS_OPTION_SHOW as unknown as ServerFieldDef['showIf'],
  },
  {
    key: 'protocol.ss-option.password',
    labelKey: 'server.field.user.password.label',
    section: 'protocol',
    type: 'secret-text',
    sensitive: true,
    generator: 'password',
    requiredWhen: [...SS_OPTION_SHOW] as unknown as ServerFieldDef['requiredWhen'],
    showIf: SS_OPTION_SHOW as unknown as ServerFieldDef['showIf'],
  },
];


export const VLESS_SEED: SchemaSeed = {
  kind: 'vless',
  category: 'encrypted',
  labelKey: 'server.proto.vless.label',
  descriptionKey: 'server.proto.vless.description',
  capability: { tls: true, reality: true, mtls: true, ech: true, ws: true, grpc: true, xhttp: true },
  shareUri: 'supported',
  docUrl: docUrlOf('vless'),
  fields: [
    userListDef('auth.users', 'server.field.users.label', AUTH_ITEM_USERNAME_UUID_FLOW),
    transportKindField([
      TRANSPORT_TCP_OPTION,
      TRANSPORT_WS_OPTION,
      TRANSPORT_GRPC_OPTION,
      TRANSPORT_XHTTP_OPTION,
    ]),
    WS_PATH_FIELD,
    GRPC_SERVICE_FIELD,
    ...XHTTP_FIELDS,
    tlsModeField([REALITY_MODE_OPTION]),
    ...TLS_BODY_FIELDS,
    ...REALITY_FIELDS,
    DECRYPTION_FIELD,
    ALLOW_INSECURE_FIELD,
  ],
};

export const VMESS_SEED: SchemaSeed = {
  kind: 'vmess',
  category: 'encrypted',
  labelKey: 'server.proto.vmess.label',
  descriptionKey: 'server.proto.vmess.description',
  capability: { tls: true, reality: true, mtls: true, ech: true, ws: true, grpc: true },
  shareUri: 'supported',
  docUrl: docUrlOf('vmess'),
  fields: [
    userListDef('auth.users', 'server.field.users.label', AUTH_ITEM_USERNAME_UUID_ALTERID),
    transportKindField([
      TRANSPORT_TCP_OPTION,
      TRANSPORT_WS_OPTION,
      TRANSPORT_GRPC_OPTION,
      TRANSPORT_MEKYA_OPTION,
      TRANSPORT_MKCP_OPTION,
    ]),
    WS_PATH_FIELD,
    GRPC_SERVICE_FIELD,
    ...MEKYA_FIELDS,
    ...MKCP_FIELDS,
    tlsModeField([REALITY_MODE_OPTION, TLSMIRROR_MODE_OPTION]),
    ...TLS_BODY_FIELDS.filter((def) => def.key !== 'tls.echKey'),
    ...REALITY_FIELDS,
    ...TLSMIRROR_FIELDS,
    ALLOW_INSECURE_FIELD,
  ],
};

export const TROJAN_SEED: SchemaSeed = {
  kind: 'trojan',
  category: 'encrypted',
  labelKey: 'server.proto.trojan.label',
  descriptionKey: 'server.proto.trojan.description',
  capability: { tls: true, reality: true, mtls: true, ech: true, ws: true, grpc: true },
  shareUri: 'supported',
  docUrl: docUrlOf('trojan'),
  fields: [
    userListDef('auth.users', 'server.field.users.label', AUTH_ITEM_USERNAME_PASSWORD),
    transportKindField([TRANSPORT_TCP_OPTION, TRANSPORT_WS_OPTION, TRANSPORT_GRPC_OPTION]),
    WS_PATH_FIELD,
    GRPC_SERVICE_FIELD,
    tlsModeField([REALITY_MODE_OPTION]),
    ...TLS_BODY_FIELDS,
    ...REALITY_FIELDS,
    ...SS_OPTION_FIELDS,
    ALLOW_INSECURE_FIELD,
  ],
};

function docUrlOf(name: string): string {
  return `https://wiki.metacubex.one/config/inbound/listeners/${name}/`;
}
