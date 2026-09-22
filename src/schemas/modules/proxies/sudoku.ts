import type { FieldSchema } from '../../types';
import { dialFamilyFields, headerFields } from './common';

// Sudoku outbound. Fields per wiki.metacubex.one/config/proxies/sudoku/.
export const sudokuProxyFields: FieldSchema[] = [
  ...headerFields('sudoku', 'Sudoku', 443),
  {
    fieldKey: 'config.key',
    label: 'proxy.sudoku.key.label',
    type: 'text',
    required: true,
    description: 'proxy.sudoku.key.description',
  },
  {
    fieldKey: 'config.aead-method',
    label: 'proxy.sudoku.aeadMethod.label',
    type: 'select',
    required: true,
    default: 'chacha20-poly1305',
    description: 'proxy.sudoku.aeadMethod.description',
    options: [
      { value: 'chacha20-poly1305', label: 'chacha20-poly1305' },
      { value: 'aes-128-gcm', label: 'aes-128-gcm' },
      { value: 'none', label: 'none' },
    ],
  },
  {
    fieldKey: 'config.padding-min',
    label: 'proxy.sudoku.paddingMin.label',
    type: 'number',
    min: 0,
    max: 100,
    description: 'proxy.sudoku.padding.description',
  },
  {
    fieldKey: 'config.padding-max',
    label: 'proxy.sudoku.paddingMax.label',
    type: 'number',
    min: 0,
    max: 100,
    description: 'proxy.sudoku.padding.description',
  },
  {
    fieldKey: 'config.table-type',
    label: 'proxy.sudoku.tableType.label',
    type: 'select',
    default: 'prefer_ascii',
    description: 'proxy.sudoku.tableType.description',
    options: [
      { value: 'prefer_ascii', label: 'prefer_ascii' },
      { value: 'prefer_entropy', label: 'prefer_entropy' },
      { value: 'up_ascii_down_entropy', label: 'up_ascii_down_entropy' },
      { value: 'up_entropy_down_ascii', label: 'up_entropy_down_ascii' },
    ],
  },
  {
    fieldKey: 'config.custom-table',
    label: 'proxy.sudoku.customTable.label',
    type: 'text',
    description: 'proxy.sudoku.customTable.description',
  },
  {
    fieldKey: 'config.custom-tables',
    label: 'proxy.sudoku.customTables.label',
    type: 'textarea',
    asList: true,
    description: 'proxy.sudoku.customTables.description',
  },
  {
    fieldKey: 'config.multiplex',
    label: 'proxy.sudoku.multiplex.label',
    type: 'select',
    default: 'off',
    description: 'proxy.sudoku.multiplex.description',
    options: [
      { value: 'off', label: 'off' },
      { value: 'auto', label: 'auto' },
      { value: 'on', label: 'on' },
    ],
  },

  // httpmask sub-block
  {
    fieldKey: 'config.httpmask.disable',
    label: 'proxy.sudoku.maskDisable.label',
    type: 'boolean',
    default: false,
    description: 'proxy.sudoku.maskDisable.description',
  },
  {
    fieldKey: 'config.httpmask.mode',
    label: 'proxy.sudoku.maskMode.label',
    type: 'select',
    default: 'legacy',
    description: 'proxy.sudoku.maskMode.description',
    showIf: { field: 'config.httpmask.disable', operator: 'eq', value: false },
    options: [
      { value: 'legacy', label: 'legacy' },
      { value: 'stream', label: 'stream' },
      { value: 'poll', label: 'poll' },
      { value: 'auto', label: 'auto' },
      { value: 'ws', label: 'ws' },
    ],
  },
  {
    fieldKey: 'config.httpmask.tls',
    label: 'proxy.commonTls.tls.label',
    type: 'boolean',
    default: false,
    description: 'proxy.commonTls.tls.description',
    showIf: [
      { field: 'config.httpmask.disable', operator: 'eq', value: false },
      { field: 'config.httpmask.mode', operator: 'in', value: ['stream', 'poll', 'auto', 'ws'] },
    ],
  },
  {
    fieldKey: 'config.httpmask.host',
    label: 'proxy.commonTls.host.label',
    type: 'text',
    placeholder: 'example.com',
    description: 'proxy.commonTls.host.description',
    showIf: [
      { field: 'config.httpmask.disable', operator: 'eq', value: false },
      { field: 'config.httpmask.mode', operator: 'in', value: ['stream', 'poll', 'auto', 'ws'] },
    ],
  },
  {
    fieldKey: 'config.httpmask.path-root',
    label: 'proxy.sudoku.maskPathRoot.label',
    type: 'text',
    placeholder: '/hidden',
    description: 'proxy.sudoku.maskPathRoot.description',
    showIf: { field: 'config.httpmask.disable', operator: 'eq', value: false },
  },

  ...dialFamilyFields({ tcpOnlyOptions: false }),
];
