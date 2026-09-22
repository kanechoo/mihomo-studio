import type { FieldSchema } from '../types';

// hosts is a record in the IR; this module edits it through one textarea of
// `name: ip[,ip]` lines that SchemaForm parses into the record shape (the
// special `lan` value and hostname aliases pass through as plain strings).
export const hostsSchema: FieldSchema[] = [
  {
    fieldKey: 'lines',
    label: 'hosts.lines.label',
    type: 'textarea',
    placeholder: '*.mihomo.dev: 127.0.0.1\nhome.lan: lan\nbaidu.com: google.com',
    description: 'hosts.lines.description',
  },
];
