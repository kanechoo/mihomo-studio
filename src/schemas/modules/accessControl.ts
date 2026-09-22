import type { FieldSchema } from '../types';

// Inbound access control: authentication pairs plus LAN allow/deny lists.
// Export writes these as the four official top-level YAML keys.
export const accessControlSchema: FieldSchema[] = [
  {
    fieldKey: 'authentication',
    label: 'accessControl.authentication.label',
    type: 'textarea',
    asList: true,
    placeholder: 'user1:pass1',
    description: 'accessControl.authentication.description',
  },
  {
    fieldKey: 'skip-auth-prefixes',
    label: 'accessControl.skipAuthPrefixes.label',
    type: 'textarea',
    asList: true,
    placeholder: '127.0.0.1/8',
    description: 'accessControl.skipAuthPrefixes.description',
  },
  {
    fieldKey: 'lan-allowed-ips',
    label: 'accessControl.lanAllowedIps.label',
    type: 'textarea',
    asList: true,
    placeholder: '0.0.0.0/0',
    description: 'accessControl.lanAllowedIps.description',
  },
  {
    fieldKey: 'lan-disallowed-ips',
    label: 'accessControl.lanDisallowedIps.label',
    type: 'textarea',
    asList: true,
    placeholder: '192.168.0.3/32',
    description: 'accessControl.lanDisallowedIps.description',
  },
];
