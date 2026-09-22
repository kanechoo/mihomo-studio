import type { ServerFieldDef } from '../dsl';

const REALITY_SHOW = [
  { field: 'tls.mode', operator: 'eq', value: 'reality' },
] as const;

function limitFields(
  branch: 'upload' | 'download',
  labelKey: string
): ServerFieldDef[] {
  const prefix = `tls.reality.limitFallback${branch === 'upload' ? 'Upload' : 'Download'}`;
  return [
    {
      key: `${prefix}.afterBytes`,
      labelKey: 'server.reality.afterBytes.label',
      section: 'tls',
      type: 'number',
      level: 'advanced',
      min: 0,
      showIf: [...REALITY_SHOW, { field: `${prefix}.bytesPerSec`, operator: 'neq', value: undefined }],
    },
    {
      key: `${prefix}.bytesPerSec`,
      labelKey,
      descriptionKey: 'server.reality.limit.description',
      section: 'tls',
      type: 'number',
      level: 'advanced',
      min: 0,
      showIf: REALITY_SHOW as unknown as ServerFieldDef['showIf'],
    },
    {
      key: `${prefix}.burstBytesPerSec`,
      labelKey: 'server.reality.burst.label',
      section: 'tls',
      type: 'number',
      level: 'advanced',
      min: 0,
      showIf: [...REALITY_SHOW, { field: `${prefix}.bytesPerSec`, operator: 'neq', value: undefined }],
    },
  ];
}

export const REALITY_FIELDS: ServerFieldDef[] = [
  {
    key: 'tls.reality.dest',
    labelKey: 'server.reality.dest.label',
    descriptionKey: 'server.reality.dest.description',
    section: 'tls',
    type: 'text',
    placeholderKey: 'server.reality.dest.placeholder',
    showIf: REALITY_SHOW as unknown as ServerFieldDef['showIf'],
  },
  {
    key: 'tls.reality.privateKey',
    labelKey: 'server.reality.privateKey.label',
    descriptionKey: 'server.reality.privateKey.description',
    section: 'tls',
    type: 'secret-text',
    sensitive: true,
    // REALITY authenticates with an X25519 pair; generating means producing a
    // real keypair (same algorithm as `mihomo generate reality-keypair`) and
    // surfacing the public half for clients, not a random string.
    keypair: 'reality',
    showIf: REALITY_SHOW as unknown as ServerFieldDef['showIf'],
  },
  {
    key: 'tls.reality.shortIds',
    labelKey: 'server.reality.shortIds.label',
    descriptionKey: 'server.reality.shortIds.description',
    section: 'tls',
    type: 'tag-list',
    // REALITY short IDs are hex, at most 16 characters — exactly what this
    // generator emits (8 random bytes, hex-encoded).
    generator: 'short-id',
    showIf: REALITY_SHOW as unknown as ServerFieldDef['showIf'],
  },
  {
    key: 'tls.reality.serverNames',
    labelKey: 'server.reality.serverNames.label',
    section: 'tls',
    type: 'tag-list',
    showIf: REALITY_SHOW as unknown as ServerFieldDef['showIf'],
  },
  {
    key: 'tls.reality.maxTimeDifference',
    labelKey: 'server.reality.maxTimeDiff.label',
    section: 'tls',
    type: 'number',
    level: 'advanced',
    min: 0,
    showIf: REALITY_SHOW as unknown as ServerFieldDef['showIf'],
  },
  {
    key: 'tls.reality.proxy',
    labelKey: 'server.field.proxy.label',
    section: 'tls',
    type: 'text',
    level: 'advanced',
    showIf: REALITY_SHOW as unknown as ServerFieldDef['showIf'],
  },
  ...limitFields('upload', 'server.reality.uploadRate.label'),
  ...limitFields('download', 'server.reality.downloadRate.label'),
];
