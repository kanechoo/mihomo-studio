import type { FieldSchema } from '../../types';
import { dialFamilyFields, headerFields } from './common';

// SSH outbound. Fields per wiki.metacubex.one/config/proxies/ssh/ — note
// mihomo spells the key material `privateKey` in camelCase, unlike every other
// kebab-case option.
export const sshProxyFields: FieldSchema[] = [
  ...headerFields('ssh', 'SSH', 22),
  {
    fieldKey: 'config.username',
    label: 'proxy.ssh.username.label',
    type: 'text',
    required: true,
    placeholder: 'root',
    description: 'proxy.ssh.username.description',
  },
  {
    fieldKey: 'config.password',
    label: 'proxy.common.password.label',
    type: 'text',
    generator: 'password',
    description: 'proxy.common.password.description',
  },
  {
    fieldKey: 'config.privateKey',
    label: 'proxy.ssh.privateKey.label',
    type: 'textarea',
    placeholder: '-----BEGIN OPENSSH PRIVATE KEY-----',
    // camelCase is mihomo's spelling here; the exporter must not "fix" it.
    description: 'proxy.ssh.privateKey.description',
  },
  ...dialFamilyFields(),
];
