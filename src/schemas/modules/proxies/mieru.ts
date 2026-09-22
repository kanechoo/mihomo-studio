import type { FieldSchema } from '../../types';
import { dialFamilyFields, headerFields } from './common';

// Mieru outbound. Fields per wiki.metacubex.one/config/proxies/mieru/.
export const mieruProxyFields: FieldSchema[] = [
  ...headerFields('mieru', 'Mieru', 443),
  {
    fieldKey: 'config.username',
    label: 'proxy.jls.username.label',
    type: 'text',
    required: true,
    description: 'proxy.jls.username.description',
  },
  {
    fieldKey: 'config.password',
    label: 'proxy.common.password.label',
    type: 'text',
    generator: 'password',
    required: true,
    placeholder: 'password',
    description: 'proxy.common.password.description',
  },
  {
    fieldKey: 'config.transport',
    label: 'proxy.mieru.transport.label',
    type: 'select',
    required: true,
    default: 'TCP',
    description: 'proxy.mieru.transport.description',
    options: [
      { value: 'TCP', label: 'TCP' },
      { value: 'UDP', label: 'UDP' },
    ],
  },
  {
    fieldKey: 'config.multiplexing',
    label: 'proxy.mieru.multiplexing.label',
    type: 'select',
    default: 'MULTIPLEXING_LOW',
    description: 'proxy.mieru.multiplexing.description',
    options: [
      { value: 'MULTIPLEXING_OFF', label: 'off' },
      { value: 'MULTIPLEXING_LOW', label: 'low' },
      { value: 'MULTIPLEXING_MIDDLE', label: 'middle' },
      { value: 'MULTIPLEXING_HIGH', label: 'high' },
    ],
  },
  {
    fieldKey: 'config.handshake-mode',
    label: 'proxy.mieru.handshakeMode.label',
    type: 'select',
    default: 'HANDSHAKE_STANDARD',
    description: 'proxy.mieru.handshakeMode.description',
    options: [
      { value: 'HANDSHAKE_STANDARD', label: 'standard' },
      { value: 'HANDSHAKE_NO_WAIT', label: 'no-wait (0-RTT)' },
    ],
  },
  {
    fieldKey: 'config.traffic-pattern',
    label: 'proxy.mieru.trafficPattern.label',
    type: 'text',
    placeholder: 'base64',
    description: 'proxy.mieru.trafficPattern.description',
  },
  ...dialFamilyFields({ tcpOnlyOptions: false }),
];
