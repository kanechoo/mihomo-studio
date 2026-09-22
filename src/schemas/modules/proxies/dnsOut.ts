import type { FieldSchema } from '../../types';

// The `dns` outbound hijacks matched requests into mihomo's internal DNS
// module — it takes no configuration beyond its name. Included so the type is
// first-class in the picker and factory rather than a passthrough accident.
export const dnsOutProxyFields: FieldSchema[] = [
  {
    fieldKey: 'name',
    label: 'proxy.name.label',
    type: 'text',
    required: true,
    placeholder: 'dns-out',
    description: 'proxy.name.description',
  },
  {
    fieldKey: 'type',
    label: 'proxy.type.label',
    type: 'select',
    default: 'dns',
    required: true,
    options: [{ value: 'dns', label: 'DNS' }],
  },
];
