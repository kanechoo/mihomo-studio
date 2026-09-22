import { describe, it, expect } from 'vitest';
import type { FieldSchema } from '../../../types';
import {
  groupProxyFieldsBySection,
  PROXY_SECTION_ORDER,
  PROXY_SECTION_TITLE_KEYS,
  resolveProxyLevel,
  resolveProxySection,
} from '../sections';
import { protocolSchemas } from '../index';

const field = (partial: Partial<FieldSchema>): FieldSchema => ({
  label: 'x',
  type: 'text',
  ...partial,
} as FieldSchema);

describe('groupProxyFieldsBySection', () => {
  it('orders sections and splits basic from advanced', () => {
    const fields: FieldSchema[] = [
      field({ fieldKey: 'name' }),
      field({ fieldKey: 'port', type: 'port' }),
      field({ fieldKey: 'config.password' }),
      field({ fieldKey: 'config.ws-opts.path' }),
      field({ fieldKey: 'config.interface-name' }),
      field({ fieldKey: 'config.smux.enabled', type: 'boolean' }),
    ];

    const groups = groupProxyFieldsBySection(fields, {}, 'vmess');
    expect(groups.map((group) => `${group.section}:${group.level}`)).toEqual([
      'basic:basic',
      'protocol:basic',
      'ws:advanced',
      'multiplexer:advanced',
      'dial:advanced',
    ]);
  });

  it('filters fields whose showIf condition is false', () => {
    const fields: FieldSchema[] = [
      field({
        fieldKey: 'config.grpc-opts.grpc-service-name',
        showIf: { field: 'config.network', operator: 'eq', value: 'grpc' },
      }),
    ];

    expect(groupProxyFieldsBySection(fields, { config: { network: 'ws' } }, 'vmess')).toHaveLength(0);
    expect(groupProxyFieldsBySection(fields, { config: { network: 'grpc' } }, 'vmess')).toHaveLength(1);
  });

  it('keeps mixed sections split by level', () => {
    const fields: FieldSchema[] = [
      field({ fieldKey: 'config.tls', type: 'boolean' }),
      field({ fieldKey: 'config.fingerprint', section: 'tls', level: 'advanced' }),
    ];

    const groups = groupProxyFieldsBySection(fields, {}, 'vmess');
    expect(groups.map((group) => `${group.section}:${group.level}`)).toEqual([
      'tls:basic',
      'tls:advanced',
    ]);
  });
});

describe('proxy schema section coverage', () => {
  it('keeps title keys and order one-to-one', () => {
    expect(Object.keys(PROXY_SECTION_TITLE_KEYS).sort()).toEqual([...PROXY_SECTION_ORDER].sort());
  });

  it('resolves every registered protocol field to a titled, ordered section', () => {
    for (const [protocol, fields] of Object.entries(protocolSchemas)) {
      for (const def of fields) {
        const section = resolveProxySection(def, protocol);
        expect(PROXY_SECTION_TITLE_KEYS, `protocol ${protocol}`).toHaveProperty(section);
        expect(PROXY_SECTION_ORDER).toContain(section);
        expect(['basic', 'advanced']).toContain(resolveProxyLevel(def, section));
      }
    }
  });
});
