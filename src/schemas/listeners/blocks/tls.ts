import type { ServerFieldDef } from '../dsl';

const MODE_SHOW = [
  { field: 'tls.mode', operator: 'eq' as const, value: 'tls' },
];

export function tlsModeField(extraOptions?: { value: string; labelKey: string }[]): ServerFieldDef {
  return {
    key: 'tls.mode',
    labelKey: 'server.tls.mode.label',
    descriptionKey: 'server.tls.mode.description',
    section: 'tls',
    type: 'select',
    default: 'none',
    options: [
      { value: 'none', labelKey: 'server.tls.mode.none' },
      { value: 'tls', labelKey: 'server.tls.mode.tls' },
      ...(extraOptions ?? []),
    ],
  };
}

export const TLS_MODE_FIELD = tlsModeField();

export const TLS_BODY_FIELDS: ServerFieldDef[] = [
    {
    id: 'cert-source',
    key: 'tls.certificate.source',
    labelKey: 'server.tls.certSource.label',
    section: 'tls',
    type: 'select',
    default: 'path',
    options: [
      { value: 'path', labelKey: 'server.tls.certSource.path' },
      { value: 'pem', labelKey: 'server.tls.certSource.pem' },
    ],
    showIf: MODE_SHOW,
  },
  {
    id: 'cert-path',
    key: 'tls.certificate.value',
    labelKey: 'server.tls.certificate.label',
    section: 'tls',
    type: 'text',
    placeholderKey: 'server.tls.certPath.placeholder',
    showIf: [...MODE_SHOW, { field: 'tls.certificate.source', operator: 'eq', value: 'path' }],
  },
  {
    id: 'cert-pem',
    key: 'tls.certificate.value',
    labelKey: 'server.tls.certificate.label',
    section: 'tls',
    type: 'pem',
    placeholderKey: 'server.tls.certPem.placeholder',
    showIf: [...MODE_SHOW, { field: 'tls.certificate.source', operator: 'eq', value: 'pem' }],
  },
  {
    id: 'key-source',
    key: 'tls.privateKey.source',
    labelKey: 'server.tls.keySource.label',
    section: 'tls',
    type: 'select',
    default: 'path',
    options: [
      { value: 'path', labelKey: 'server.tls.certSource.path' },
      { value: 'pem', labelKey: 'server.tls.certSource.pem' },
    ],
    showIf: MODE_SHOW,
  },
  {
    id: 'key-path',
    key: 'tls.privateKey.value',
    labelKey: 'server.tls.privateKey.label',
    section: 'tls',
    type: 'text',
    placeholderKey: 'server.tls.keyPath.placeholder',
    showIf: [...MODE_SHOW, { field: 'tls.privateKey.source', operator: 'eq', value: 'path' }],
  },
  {
    id: 'key-pem',
    key: 'tls.privateKey.value',
    labelKey: 'server.tls.privateKey.label',
    section: 'tls',
    type: 'pem',
    placeholderKey: 'server.tls.keyPem.placeholder',
    showIf: [...MODE_SHOW, { field: 'tls.privateKey.source', operator: 'eq', value: 'pem' }],
  },
  {
    key: 'tls.clientAuthType',
    labelKey: 'server.tls.clientAuthType.label',
    descriptionKey: 'server.tls.clientAuthType.description',
    section: 'tls',
    type: 'select',
    level: 'advanced',
    default: '',
    options: [
      { value: '', labelKey: 'server.tls.clientAuthType.off' },
      { value: 'request', labelKey: 'server.tls.clientAuthType.request' },
      { value: 'require-any', labelKey: 'server.tls.clientAuthType.requireAny' },
      { value: 'verify-if-given', labelKey: 'server.tls.clientAuthType.verifyIfGiven' },
      { value: 'require-and-verify', labelKey: 'server.tls.clientAuthType.requireAndVerify' },
    ],
    showIf: MODE_SHOW,
  },
  {
    key: 'tls.clientAuthCert.value',
    labelKey: 'server.tls.clientAuthCert.label',
    section: 'tls',
    type: 'text',
    level: 'advanced',
    placeholderKey: 'server.tls.caPath.placeholder',
    showIf: [
      ...MODE_SHOW,
      { field: 'tls.clientAuthType', operator: 'in', value: ['verify-if-given', 'require-and-verify'] },
    ],
  },
  {
    key: 'tls.echKey',
    labelKey: 'server.tls.echKey.label',
    descriptionKey: 'server.tls.echKey.description',
    section: 'tls',
    type: 'pem',
    level: 'advanced',
    showIf: MODE_SHOW,
  },
];

export const TLS_FIELDS: ServerFieldDef[] = [TLS_MODE_FIELD, ...TLS_BODY_FIELDS];
