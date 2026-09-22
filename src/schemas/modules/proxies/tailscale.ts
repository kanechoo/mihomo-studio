import type { FieldSchema } from '../../types';
import { dialFamilyFields } from './common';

// Tailscale outbound. Fields per wiki.metacubex.one/config/proxies/tailscale/.
// Without auth-key the node prints an interactive login URL — a browser form
// cannot complete that flow, so the field description says so.
export const tailscaleProxyFields: FieldSchema[] = [
  {
    fieldKey: 'name',
    label: 'proxy.name.label',
    type: 'text',
    required: true,
    placeholder: 'Tailscale Node',
    description: 'proxy.name.description',
  },
  {
    fieldKey: 'type',
    label: 'proxy.type.label',
    type: 'select',
    default: 'tailscale',
    required: true,
    options: [{ value: 'tailscale', label: 'Tailscale' }],
  },
  {
    fieldKey: 'config.udp',
    label: 'proxy.common.udp.label',
    type: 'boolean',
    default: false,
    description: 'proxy.tailscale.udp.description',
  },
  {
    fieldKey: 'config.hostname',
    label: 'proxy.tailscale.hostname.label',
    type: 'text',
    placeholder: 'my-device',
    description: 'proxy.tailscale.hostname.description',
  },
  {
    fieldKey: 'config.auth-key',
    label: 'proxy.tailscale.authKey.label',
    type: 'text',
    placeholder: 'tskey-auth-...',
    description: 'proxy.tailscale.authKey.description',
  },
  {
    fieldKey: 'config.control-url',
    label: 'proxy.tailscale.controlUrl.label',
    type: 'text',
    placeholder: 'https://headscale.example.com',
    description: 'proxy.tailscale.controlUrl.description',
  },
  {
    fieldKey: 'config.state-dir',
    label: 'proxy.tailscale.stateDir.label',
    type: 'text',
    placeholder: '/var/lib/tailscale',
    description: 'proxy.tailscale.stateDir.description',
  },
  {
    fieldKey: 'config.ephemeral',
    label: 'proxy.tailscale.ephemeral.label',
    type: 'boolean',
    default: false,
    description: 'proxy.tailscale.ephemeral.description',
  },
  {
    fieldKey: 'config.accept-routes',
    label: 'proxy.tailscale.acceptRoutes.label',
    type: 'boolean',
    default: false,
    description: 'proxy.tailscale.acceptRoutes.description',
  },
  {
    fieldKey: 'config.exit-node',
    label: 'proxy.tailscale.exitNode.label',
    type: 'text',
    placeholder: 'auto:any',
    description: 'proxy.tailscale.exitNode.description',
  },
  {
    fieldKey: 'config.exit-node-allow-lan-access',
    label: 'proxy.tailscale.exitNodeLan.label',
    type: 'boolean',
    default: false,
    description: 'proxy.tailscale.exitNodeLan.description',
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
  ...dialFamilyFields({ tcpOnlyOptions: false }),
];
