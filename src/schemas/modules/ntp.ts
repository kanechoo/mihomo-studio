import type { FieldSchema } from '../types';

// NTP service. Six documented fields per wiki.metacubex.one/config/ntp/
// (there is no ipv6 option — that guess in the task brief does not exist
// upstream).
export const ntpSchema: FieldSchema[] = [
  {
    fieldKey: 'enable',
    label: 'ntp.enable.label',
    type: 'boolean',
    default: false,
    description: 'ntp.enable.description',
  },
  {
    fieldKey: 'server',
    label: 'ntp.server.label',
    type: 'text',
    default: 'time.apple.com',
    placeholder: 'time.apple.com',
    description: 'ntp.server.description',
    showIf: { field: 'enable', operator: 'eq', value: true },
  },
  {
    fieldKey: 'port',
    label: 'ntp.port.label',
    type: 'port',
    default: 123,
    min: 1,
    max: 65535,
    description: 'ntp.port.description',
    showIf: { field: 'enable', operator: 'eq', value: true },
  },
  {
    fieldKey: 'interval',
    label: 'ntp.interval.label',
    type: 'number',
    default: 30,
    min: 1,
    description: 'ntp.interval.description',
    showIf: { field: 'enable', operator: 'eq', value: true },
  },
  {
    fieldKey: 'write-to-system',
    label: 'ntp.writeToSystem.label',
    type: 'boolean',
    default: false,
    description: 'ntp.writeToSystem.description',
    showIf: { field: 'enable', operator: 'eq', value: true },
  },
  {
    fieldKey: 'dialer-proxy',
    label: 'proxy.dial.dialerProxy.label',
    type: 'text',
    placeholder: 'DIRECT',
    description: 'ntp.dialerProxy.description',
    showIf: { field: 'enable', operator: 'eq', value: true },
  },
];
