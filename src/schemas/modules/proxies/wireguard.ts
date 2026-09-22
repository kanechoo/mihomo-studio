import type { FieldSchema } from '../../types';
import { dialFamilyFields, headerFields } from './common';

// WireGuard outbound. Fields per wiki.metacubex.one/config/proxies/wg/.
// The repeatable `peers` list has no repeater component in this form; imported
// peer blocks ride through the config passthrough untouched (recorded in the
// coverage matrix rather than half-modelled).
export const wireguardProxyFields: FieldSchema[] = [
  ...headerFields('wireguard', 'WireGuard', 51820),
  {
    fieldKey: 'config.ip',
    label: 'proxy.wireguard.ip.label',
    type: 'text',
    required: true,
    placeholder: '172.16.0.2',
    description: 'proxy.wireguard.ip.description',
  },
  {
    fieldKey: 'config.ipv6',
    label: 'proxy.wireguard.ipv6.label',
    type: 'text',
    placeholder: 'fd01:5ca1:ab1e::2',
    description: 'proxy.wireguard.ipv6.description',
  },
  {
    fieldKey: 'config.private-key',
    label: 'proxy.wireguard.privateKey.label',
    type: 'text',
    required: true,
    placeholder: 'eCtXsJZ27+4PbhDkHnB923tkUn2Gj59wZw5wFA75MnU=',
    description: 'proxy.wireguard.privateKey.description',
    // This node's own Curve25519 key: generating produces a real keypair (the
    // same algorithm as `wg genkey`) and shows the public half to register
    // with the peer. The peer's public-key field below must never be
    // generated — it comes from the other side.
    keypair: 'x25519',
  },
  {
    fieldKey: 'config.public-key',
    label: 'proxy.wireguard.publicKey.label',
    type: 'text',
    required: true,
    placeholder: 'Cr8hWlKvtDt7nrvf+f0brNQQzabAqrjfBvas9pmowjo=',
    description: 'proxy.wireguard.publicKey.description',
  },
  {
    fieldKey: 'config.pre-shared-key',
    label: 'proxy.wireguard.presharedKey.label',
    type: 'text',
    description: 'proxy.wireguard.presharedKey.description',
    // A pre-shared key is exactly 32 random bytes, base64-encoded — the same
    // output `wg genpsk` produces. Both peers must hold the identical value.
    generator: 'base64-32',
  },
  {
    fieldKey: 'config.reserved',
    label: 'proxy.wireguard.reserved.label',
    type: 'text',
    placeholder: 'U4An  或  [209,98,59]',
    description: 'proxy.wireguard.reserved.description',
  },
  {
    fieldKey: 'config.udp',
    label: 'proxy.common.udp.label',
    type: 'boolean',
    default: true,
    description: 'proxy.common.udp.description',
  },
  {
    fieldKey: 'config.persistent-keepalive',
    label: 'proxy.wireguard.keepalive.label',
    type: 'number',
    min: 0,
    description: 'proxy.wireguard.keepalive.description',
  },
  {
    fieldKey: 'config.mtu',
    label: 'proxy.wireguard.mtu.label',
    type: 'number',
    min: 0,
    description: 'proxy.wireguard.mtu.description',
  },
  // AmneziaWG obfuscation — the classic numeric parameter set.
  {
    fieldKey: 'config.amnezia-wg-option.jc',
    label: 'proxy.amnezia.jc.label',
    type: 'number',
    min: 0,
    description: 'proxy.amnezia.jc.description',
  },
  {
    fieldKey: 'config.amnezia-wg-option.jmin',
    label: 'proxy.amnezia.jmin.label',
    type: 'number',
    min: 0,
    description: 'proxy.amnezia.jmin.description',
  },
  {
    fieldKey: 'config.amnezia-wg-option.jmax',
    label: 'proxy.amnezia.jmax.label',
    type: 'number',
    min: 0,
    description: 'proxy.amnezia.jmax.description',
  },
  {
    fieldKey: 'config.amnezia-wg-option.s1',
    label: 'proxy.amnezia.s1.label',
    type: 'number',
    min: 0,
    description: 'proxy.amnezia.s1.description',
  },
  {
    fieldKey: 'config.amnezia-wg-option.s2',
    label: 'proxy.amnezia.s2.label',
    type: 'number',
    min: 0,
    description: 'proxy.amnezia.s2.description',
  },
  {
    fieldKey: 'config.amnezia-wg-option.h1',
    label: 'proxy.amnezia.h1.label',
    type: 'number',
    min: 0,
    description: 'proxy.amnezia.h1.description',
  },
  {
    fieldKey: 'config.amnezia-wg-option.h2',
    label: 'proxy.amnezia.h2.label',
    type: 'number',
    min: 0,
    description: 'proxy.amnezia.h2.description',
  },
  {
    fieldKey: 'config.amnezia-wg-option.h3',
    label: 'proxy.amnezia.h3.label',
    type: 'number',
    min: 0,
    description: 'proxy.amnezia.h3.description',
  },
  {
    fieldKey: 'config.amnezia-wg-option.h4',
    label: 'proxy.amnezia.h4.label',
    type: 'number',
    min: 0,
    description: 'proxy.amnezia.h4.description',
  },

  // Userspace IP stack selection shared by the VPN-style outbounds.
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

  ...dialFamilyFields({ tcpOnlyOptions: false }),
];
