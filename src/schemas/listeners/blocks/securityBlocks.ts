import type { ServerFieldDef } from '../dsl';
import { userListDef } from './users';
import { AUTH_ITEM_NAME_PASSWORD, AUTH_ITEM_USERNAME_PASSWORD } from './users';

const STLS_ON = [
  { field: 'security.shadowTls.enable', operator: 'eq', value: true },
] as const;

export const SHADOW_TLS_FIELDS: ServerFieldDef[] = [
  {
    key: 'security.shadowTls.enable',
    labelKey: 'server.stls.enable.label',
    section: 'security',
    type: 'boolean',
    default: false,
  },
  {
    key: 'security.shadowTls.version',
    labelKey: 'server.stls.version.label',
    section: 'security',
    type: 'select',
    default: 3,
    options: [
      { value: 1, labelKey: 'server.stls.version.v1' },
      { value: 2, labelKey: 'server.stls.version.v2' },
      { value: 3, labelKey: 'server.stls.version.v3' },
    ],
    showIf: STLS_ON as unknown as ServerFieldDef['showIf'],
  },
  {
    key: 'security.shadowTls.password',
    labelKey: 'server.stls.password.label',
    section: 'security',
    type: 'secret-text',
    sensitive: true,
    generator: 'password',
    showIf: [
      ...STLS_ON,
      { field: 'security.shadowTls.version', operator: 'eq', value: 2 },
    ] as unknown as ServerFieldDef['showIf'],
  },
  userListDef(
    'security.shadowTls.users',
    'server.stls.users.label',
    AUTH_ITEM_NAME_PASSWORD,
    {
      showIf: [
        ...STLS_ON,
        { field: 'security.shadowTls.version', operator: 'eq', value: 3 },
      ] as unknown as ServerFieldDef['showIf'],
      section: 'security' as const,
    }
  ),
  {
    key: 'security.shadowTls.handshake.dest',
    labelKey: 'server.stls.handshakeDest.label',
    descriptionKey: 'server.stls.handshakeDest.description',
    section: 'security',
    type: 'text',
    placeholderKey: 'server.stls.handshakeDest.placeholder',
    showIf: STLS_ON as unknown as ServerFieldDef['showIf'],
  },
  {
    key: 'security.shadowTls.handshake.proxy',
    labelKey: 'server.field.proxy.label',
    section: 'security',
    type: 'text',
    level: 'advanced',
    showIf: STLS_ON as unknown as ServerFieldDef['showIf'],
  },
];

const RES_ON = [{ field: 'security.resTls.enable', operator: 'eq', value: true }] as const;

export const RES_TLS_FIELDS: ServerFieldDef[] = [
  {
    key: 'security.resTls.enable',
    labelKey: 'server.restls.enable.label',
    section: 'security',
    type: 'boolean',
    default: false,
  },
  {
    key: 'security.resTls.dest',
    labelKey: 'server.restls.dest.label',
    section: 'security',
    type: 'text',
    showIf: RES_ON as unknown as ServerFieldDef['showIf'],
  },
  {
    key: 'security.resTls.password',
    labelKey: 'server.restls.password.label',
    section: 'security',
    type: 'secret-text',
    sensitive: true,
    generator: 'password',
    showIf: RES_ON as unknown as ServerFieldDef['showIf'],
  },
  {
    key: 'security.resTls.restlsScript',
    labelKey: 'server.restls.script.label',
    section: 'security',
    type: 'text',
    level: 'advanced',
    showIf: RES_ON as unknown as ServerFieldDef['showIf'],
  },
  {
    key: 'security.resTls.minRecordLen',
    labelKey: 'server.restls.minRecordLen.label',
    section: 'security',
    type: 'number',
    level: 'advanced',
    min: 0,
    showIf: RES_ON as unknown as ServerFieldDef['showIf'],
  },
  {
    key: 'security.resTls.proxy',
    labelKey: 'server.field.proxy.label',
    section: 'security',
    type: 'text',
    level: 'advanced',
    showIf: RES_ON as unknown as ServerFieldDef['showIf'],
  },
  {
    key: 'security.resTls.rateLimit',
    labelKey: 'server.restls.rateLimit.label',
    descriptionKey: 'server.rateLimit.description',
    section: 'security',
    type: 'number',
    level: 'advanced',
    min: 0,
    showIf: RES_ON as unknown as ServerFieldDef['showIf'],
  },
];

const JLS_ON = [{ field: 'security.jls.enable', operator: 'eq', value: true }] as const;

export const JLS_FIELDS: ServerFieldDef[] = [
  {
    key: 'security.jls.enable',
    labelKey: 'server.jls.enable.label',
    section: 'security',
    type: 'boolean',
    default: false,
  },
  {
    key: 'security.jls.dest',
    labelKey: 'server.jls.dest.label',
    descriptionKey: 'server.jls.dest.description',
    section: 'security',
    type: 'text',
    placeholderKey: 'server.jls.dest.placeholder',
    showIf: JLS_ON as unknown as ServerFieldDef['showIf'],
  },
  {
    key: 'security.jls.sni',
    labelKey: 'server.jls.sni.label',
    descriptionKey: 'server.jls.sni.description',
    section: 'security',
    type: 'text',
    level: 'advanced',
    showIf: JLS_ON as unknown as ServerFieldDef['showIf'],
  },
  {
    key: 'security.jls.alpn',
    labelKey: 'server.field.alpn.label',
    section: 'security',
    type: 'tag-list',
    level: 'advanced',
    showIf: JLS_ON as unknown as ServerFieldDef['showIf'],
  },
  {
    key: 'security.jls.proxy',
    labelKey: 'server.field.proxy.label',
    section: 'security',
    type: 'text',
    level: 'advanced',
    showIf: JLS_ON as unknown as ServerFieldDef['showIf'],
  },
  {
    key: 'security.jls.rateLimit',
    labelKey: 'server.jls.rateLimit.label',
    descriptionKey: 'server.rateLimit.description',
    section: 'security',
    type: 'number',
    level: 'advanced',
    min: 0,
    showIf: JLS_ON as unknown as ServerFieldDef['showIf'],
  },
  userListDef('security.jls.users', 'server.jls.users.label', AUTH_ITEM_USERNAME_PASSWORD, {
    showIf: JLS_ON as unknown as ServerFieldDef['showIf'],
    section: 'security' as const,
  }),
];

export const MUX_FIELDS: ServerFieldDef[] = [
  {
    key: 'security.muxOption.padding',
    labelKey: 'server.mux.padding.label',
    section: 'security',
    type: 'boolean',
    level: 'advanced',
  },
  {
    key: 'security.muxOption.brutal.enabled',
    labelKey: 'server.mux.brutal.label',
    section: 'security',
    type: 'boolean',
    level: 'advanced',
  },
  {
    key: 'security.muxOption.brutal.up',
    labelKey: 'server.mux.up.label',
    descriptionKey: 'server.mux.bandwidth.description',
    section: 'security',
    type: 'number',
    level: 'advanced',
    min: 0,
    showIf: [{ field: 'security.muxOption.brutal.enabled', operator: 'eq', value: true }],
  },
  {
    key: 'security.muxOption.brutal.down',
    labelKey: 'server.mux.down.label',
    descriptionKey: 'server.mux.bandwidth.description',
    section: 'security',
    type: 'number',
    level: 'advanced',
    min: 0,
    showIf: [{ field: 'security.muxOption.brutal.enabled', operator: 'eq', value: true }],
  },
];
