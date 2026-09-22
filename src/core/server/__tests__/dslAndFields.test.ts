import { describe, it, expect } from 'vitest';
import { groupBySection, filterByLevel, isVisible } from '../../../schemas/listeners/dsl';
import type { ServerFieldDef } from '../../../schemas/listeners/dsl';
import { isValidPem } from '../../../components/server/fields/pem';
import {
  kvEntriesToRecord,
  recordToKvEntries,
  upsertKvEntry,
  removeKvEntry,
} from '../../../components/server/fields/kv';

function def(partial: Partial<ServerFieldDef>): ServerFieldDef {
  return {
    key: 'k',
    labelKey: 'l',
    section: 'protocol',
    type: 'text',
    ...partial,
  };
}

describe('groupBySection', () => {
  it('groups in canonical section order and drops empty sections', () => {
    const grouped = groupBySection([
      def({ key: 'cipher', section: 'protocol' }),
      def({ key: 'port', section: 'common' }),
      def({ key: 'ech', section: 'tls' }),
      def({ key: 'users', section: 'auth' }),
      def({ key: 'mux', section: 'security' }),
      def({ key: 'wsPath', section: 'transport' }),
    ]);
    expect(grouped.map((g) => g.section)).toEqual([
      'common',
      'auth',
      'transport',
      'tls',
      'security',
      'protocol',
    ]);
    expect(grouped[0].fields.map((f) => f.key)).toEqual(['port']);
  });

  it('keeps insertion order within a section', () => {
    const grouped = groupBySection([
      def({ key: 'b' }),
      def({ key: 'a' }),
      def({ key: 'c' }),
    ]);
    expect(grouped[0].fields.map((f) => f.key)).toEqual(['b', 'a', 'c']);
  });
});

describe('filterByLevel', () => {
  it('hides advanced fields at basic level and shows everything advanced', () => {
    const fields = [def({ key: 'basic1', level: 'basic' }), def({ key: 'adv1', level: 'advanced' })];
    expect(filterByLevel(fields, 'basic').map((f) => f.key)).toEqual(['basic1']);
    expect(filterByLevel(fields, 'advanced').length).toBe(2);
  });

  it('treats missing level as basic', () => {
    expect(filterByLevel([def({})], 'basic')).toHaveLength(1);
  });
});

describe('isVisible', () => {
  const values = { tls: { mode: 'reality' }, transport: { kind: 'ws' } };

  it('is visible without conditions', () => {
    expect(isVisible(def({}), values)).toBe(true);
  });

  it('supports eq/neq on nested paths with AND semantics', () => {
    expect(
      isVisible(def({ showIf: [{ field: 'tls.mode', operator: 'eq', value: 'reality' }] }), values)
    ).toBe(true);
    expect(
      isVisible(def({ showIf: [{ field: 'tls.mode', operator: 'neq', value: 'reality' }] }), values)
    ).toBe(false);
    expect(
      isVisible(
        def({
          showIf: [
            { field: 'tls.mode', operator: 'eq', value: 'reality' },
            { field: 'transport.kind', operator: 'eq', value: 'grpc' },
          ],
        }),
        values
      )
    ).toBe(false);
  });

  it('supports in/nin membership', () => {
    expect(
      isVisible(
        def({ showIf: [{ field: 'transport.kind', operator: 'in', value: ['ws', 'grpc'] }] }),
        values
      )
    ).toBe(true);
    expect(
      isVisible(
        def({ showIf: [{ field: 'transport.kind', operator: 'nin', value: ['ws'] }] }),
        values
      )
    ).toBe(false);
  });
});

const VALID_PEM = [
  '-----BEGIN CERTIFICATE-----',
  'MIIBszCCAVmgAwIBAgIUXo6Y5KQ=',
  '-----END CERTIFICATE-----',
].join('\n');

describe('isValidPem', () => {
  it('accepts a well-formed PEM block', () => {
    expect(isValidPem(VALID_PEM)).toBe(true);
  });

  it('accepts multi-line base64 body and trailing newline', () => {
    const multiline = [
      '-----BEGIN PRIVATE KEY-----',
      'AAAA',
      'BBBB',
      '-----END PRIVATE KEY-----',
      '',
    ].join('\n');
    expect(isValidPem(multiline)).toBe(true);
  });

  it('rejects empty, path-like and malformed content', () => {
    expect(isValidPem('')).toBe(false);
    expect(isValidPem('/etc/ssl/server.crt')).toBe(false);
    expect(isValidPem('-----BEGIN CERTIFICATE-----\nAAAA\n-----END WRONG-----')).toBe(
      false
    );
    expect(isValidPem('-----BEGIN CERTIFICATE-----\nnot_base64!!\n-----END CERTIFICATE-----')).toBe(
      false
    );
  });
});

describe('kv helpers', () => {
  it('round-trips entries through a record preserving order', () => {
    const record = kvEntriesToRecord([
      { key: 'user2', value: 'pw2' },
      { key: 'user1', value: 'pw1' },
    ]);
    expect(Object.keys(record)).toEqual(['user2', 'user1']);
    expect(recordToKvEntries(record)).toEqual([
      { key: 'user2', value: 'pw2' },
      { key: 'user1', value: 'pw1' },
    ]);
  });

  it('drops blank-key entries when serialising but keeps rows while editing', () => {
    const record = kvEntriesToRecord([
      { key: '', value: 'typing' },
      { key: 'real', value: 'x' },
    ]);
    expect(record).toEqual({ real: 'x' });
  });

  it('upserts and removes by index without mutating input', () => {
    const base = [
      { key: 'a', value: '1' },
      { key: 'b', value: '2' },
    ];
    const patched = upsertKvEntry(base, 0, { value: '9' });
    expect(patched[0]).toEqual({ key: 'a', value: '9' });
    expect(base[0].value).toBe('1');
    expect(removeKvEntry(base, 1)).toEqual([{ key: 'a', value: '1' }]);
  });

  it('handles undefined records as empty lists', () => {
    expect(recordToKvEntries(undefined)).toEqual([]);
  });
});
