import type { FieldSchema } from '../../types';

// The `rematch` outbound re-enters rule matching under a new name or a named
// sub-rule. Fields per wiki.metacubex.one/config/proxies/rematch/.
export const rematchProxyFields: FieldSchema[] = [
  {
    fieldKey: 'name',
    label: 'proxy.name.label',
    type: 'text',
    required: true,
    placeholder: 'rematch-out',
    description: 'proxy.name.description',
  },
  {
    fieldKey: 'type',
    label: 'proxy.type.label',
    type: 'select',
    default: 'rematch',
    required: true,
    options: [{ value: 'rematch', label: 'Rematch' }],
  },
  {
    fieldKey: 'config.target-rematch-name',
    label: 'proxy.rematch.targetRematchName.label',
    type: 'text',
    placeholder: 'rematch1',
    description: 'proxy.rematch.targetRematchName.description',
  },
  {
    fieldKey: 'config.target-sub-rule',
    label: 'proxy.rematch.targetSubRule.label',
    type: 'text',
    placeholder: 'sub-rule-name',
    description: 'proxy.rematch.targetSubRule.description',
  },
];
