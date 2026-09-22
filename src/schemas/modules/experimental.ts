import type { FieldSchema } from '../types';

// The three documented experimental switches.
export const experimentalSchema: FieldSchema[] = [
  {
    fieldKey: 'quic-go-disable-gso',
    label: 'experimental.gso.label',
    type: 'boolean',
    default: false,
    description: 'experimental.gso.description',
  },
  {
    fieldKey: 'quic-go-disable-ecn',
    label: 'experimental.ecn.label',
    type: 'boolean',
    default: false,
    description: 'experimental.ecn.description',
  },
  {
    fieldKey: 'dialer-ip4p-convert',
    label: 'experimental.ip4p.label',
    type: 'boolean',
    default: false,
    description: 'experimental.ip4p.description',
  },
];
