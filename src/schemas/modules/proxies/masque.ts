import type { FieldSchema } from '../../types';
import { dialFamilyFields, headerFields } from './common';

// MASQUE outbound — HTTP/3 datagram tunnel with three network flavours.
// Fields per wiki.metacubex.one/config/proxies/masque/. The h3-l4proxy
// flavour drops ip/ipv6/mtu and cannot carry UDP; the form hides both sides
// of that rule via showIf/lockIf so the file can never disagree with it.

function ipStack(): FieldSchema[] {
  return [
    {
      fieldKey: 'config.ip-stack.mode',
      label: 'proxy.ipStack.mode.label',
      type: 'select',
      default: 'auto',
      description: 'proxy.ipStack.mode.description',
      options: [
        { value: 'auto', label: 'auto' },
        { value: 'gvisor', label: 'gvisor' },
        { value: 'system', label: 'system' },
      ],
    },
    {
      fieldKey: 'config.ip-stack.congestion-controller',
      label: 'proxy.masque.stackCc.label',
      type: 'select',
      default: 'cubic',
      description: 'proxy.masque.stackCc.description',
      showIf: { field: 'config.network', operator: 'neq', value: '' },
      options: [
        { value: 'cubic', label: 'cubic' },
        { value: 'reno', label: 'reno' },
        { value: 'bbr', label: 'bbr' },
        { value: 'bbr3', label: 'bbr3' },
      ],
    },
  ];
}

export const masqueProxyFields: FieldSchema[] = [
  ...headerFields('masque', 'MASQUE', 443),
  {
    fieldKey: 'config.private-key',
    label: 'proxy.wireguard.privateKey.label',
    type: 'text',
    required: true,
    placeholder: 'base64',
    description: 'proxy.wireguard.privateKey.description',
  },
  {
    fieldKey: 'config.public-key',
    label: 'proxy.wireguard.publicKey.label',
    type: 'text',
    required: true,
    placeholder: 'base64',
    description: 'proxy.wireguard.publicKey.description',
  },
  {
    fieldKey: 'config.udp',
    label: 'proxy.common.udp.label',
    type: 'boolean',
    default: true,
    description: 'proxy.common.udp.description',
    lockIf: {
      when: { field: 'config.network', operator: 'eq', value: 'h3-l4proxy' },
      value: false,
      reason: 'proxy.masque.l4proxyNoUdp',
    },
  },
  {
    fieldKey: 'config.network',
    label: 'proxy.masque.network.label',
    type: 'select',
    default: '',
    description: 'proxy.masque.network.description',
    options: [
      { value: '', label: 'proxy.masque.network.default' },
      { value: 'h3-l4proxy', label: 'h3-l4proxy' },
      { value: 'h2', label: 'h2' },
    ],
  },

  // Tunnel addressing only exists in the IP-flavoured modes.
  {
    fieldKey: 'config.ip',
    label: 'proxy.wireguard.ip.label',
    type: 'text',
    placeholder: '172.19.0.2',
    description: 'proxy.wireguard.ip.description',
    showIf: { field: 'config.network', operator: 'nin', value: ['h3-l4proxy'] },
  },
  {
    fieldKey: 'config.ipv6',
    label: 'proxy.wireguard.ipv6.label',
    type: 'text',
    placeholder: 'fd01::2',
    description: 'proxy.wireguard.ipv6.description',
    showIf: { field: 'config.network', operator: 'nin', value: ['h3-l4proxy'] },
  },
  {
    fieldKey: 'config.mtu',
    label: 'proxy.wireguard.mtu.label',
    type: 'number',
    min: 0,
    description: 'proxy.wireguard.mtu.description',
    showIf: { field: 'config.network', operator: 'nin', value: ['h3-l4proxy'] },
  },
  ...ipStack(),
  ...dialFamilyFields({ tcpOnlyOptions: false }),
  {
    fieldKey: 'config.congestion-controller',
    label: 'proxy.tuic.congestionController.label',
    type: 'select',
    default: 'bbr',
    description: 'proxy.tuic.congestionController.description',
    options: [{ value: 'bbr', label: 'bbr' }],
  },
  {
    fieldKey: 'config.handshake-timeout',
    label: 'proxy.quic.handshakeTimeout.label',
    type: 'number',
    min: 0,
    description: 'proxy.quic.handshakeTimeout.description',
  },
  {
    fieldKey: 'config.remote-dns-resolve',
    label: 'proxy.vpn.remoteDnsResolve.label',
    type: 'boolean',
    default: false,
    description: 'proxy.vpn.remoteDnsResolve.description',
  },
  {
    fieldKey: 'config.dns',
    label: 'proxy.vpn.dnsList.label',
    type: 'textarea',
    asList: true,
    placeholder: '1.1.1.1',
    description: 'proxy.vpn.dnsList.description',
    showIf: { field: 'config.remote-dns-resolve', operator: 'eq', value: true },
  },
];
