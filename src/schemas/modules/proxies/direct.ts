import type { FieldSchema } from '../../types';

// Direct protocol schema.
//
// A `direct` outbound sends traffic out from the local machine, so unlike every
// other protocol it has no server or port — only the common dial options that
// control *how* the local connection is made.
export const directProxyFields: FieldSchema[] = [
  {
    fieldKey: 'name',
    label: 'proxy.name.label',
    type: 'text',
    required: true,
    placeholder: 'direct',
    description: 'proxy.name.description',
  },
  {
    fieldKey: 'type',
    label: 'proxy.type.label',
    type: 'select',
    default: 'direct',
    required: true,
    options: [{ value: 'direct', label: 'Direct' }],
  },
  {
    fieldKey: 'config.interface-name',
    label: 'proxy.interfaceName.label',
    type: 'text',
    placeholder: 'en0',
    description: 'proxy.interfaceName.description',
  },
  {
    fieldKey: 'config.routing-mark',
    label: 'proxy.routingMark.label',
    type: 'number',
    min: 0,
    description: 'proxy.routingMark.description',
  },
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
  {
    fieldKey: 'config.dialer-proxy',
    label: 'proxy.dialerProxy.label',
    type: 'text',
    description: 'proxy.dialerProxy.description',
  },
  {
    fieldKey: 'config.tfo',
    label: 'proxy.tfo.label',
    type: 'boolean',
    default: false,
    description: 'proxy.tfo.description',
  },
  {
    fieldKey: 'config.mptcp',
    label: 'proxy.mptcp.label',
    type: 'boolean',
    default: false,
    description: 'proxy.mptcp.description',
  },
];
