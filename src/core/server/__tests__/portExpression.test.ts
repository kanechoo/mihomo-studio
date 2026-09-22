import { describe, it, expect } from 'vitest';
import {
  parsePortExpression,
  isValidPortExpression,
  isSinglePortExpression,
  normalizePortExpression,
  expandPortExpression,
  PORT_MAX,
} from '../portExpression';

interface Row {
  expr: string;
  ranges?: { lo: number; hi: number }[];
  errorCodes?: string[];
}

const PARSE_ROWS: Row[] = [
  { expr: '', errorCodes: ['empty'] },
  { expr: '   ', errorCodes: ['empty'] },
  { expr: '443', ranges: [{ lo: 443, hi: 443 }] },
  { expr: ' 443 ', ranges: [{ lo: 443, hi: 443 }] },
  { expr: '200,302', ranges: [{ lo: 200, hi: 200 }, { lo: 302, hi: 302 }] },
  {
    expr: '114-514/810-1919,65530',
    ranges: [
      { lo: 114, hi: 514 },
      { lo: 810, hi: 1919 },
      { lo: 65530, hi: 65530 },
    ],
  },
  { expr: '1-65535', ranges: [{ lo: 1, hi: 65535 }] },
  { expr: '8080/8443', ranges: [{ lo: 8080, hi: 8080 }, { lo: 8443, hi: 8443 }] },
  { expr: '200, 204 , 401-429', ranges: [{ lo: 200, hi: 200 }, { lo: 204, hi: 204 }, { lo: 401, hi: 429 }] },
  { expr: '0', errorCodes: ['bounds'] },
  { expr: '65536', errorCodes: ['bounds'] },
  { expr: '0-100', errorCodes: ['bounds'] },
  { expr: '1-65536', errorCodes: ['bounds'] },
  { expr: '-5', errorCodes: ['syntax'] },
  { expr: '5-', errorCodes: ['syntax'] },
  { expr: 'abc', errorCodes: ['syntax'] },
  { expr: '12a', errorCodes: ['syntax'] },
  { expr: '1.5', errorCodes: ['syntax'] },
  { expr: 'a-b', errorCodes: ['syntax'] },
  { expr: '10;20', errorCodes: ['syntax'] },
  { expr: ',443', errorCodes: ['syntax'], ranges: [{ lo: 443, hi: 443 }] },
  { expr: '443,', errorCodes: ['syntax'], ranges: [{ lo: 443, hi: 443 }] },
  { expr: '10--20', errorCodes: ['syntax'] },
  { expr: '10-5', errorCodes: ['order'] },
  { expr: '500-100,700', errorCodes: ['order'], ranges: [{ lo: 700, hi: 700 }] },
  { expr: '65535', ranges: [{ lo: 65535, hi: 65535 }] },
  { expr: '1-2,2-3', ranges: [{ lo: 1, hi: 2 }, { lo: 2, hi: 3 }] },
];

describe('parsePortExpression (table-driven)', () => {
  for (const row of PARSE_ROWS) {
    it(`parses "${row.expr}"`, () => {
      const result = parsePortExpression(row.expr);
      expect(result.ranges).toEqual(row.ranges ?? []);
      expect(result.errors.map((e) => e.code)).toEqual(row.errorCodes ?? []);
    });
  }
});

describe('isValidPortExpression', () => {
  it('accepts official examples and rejects malformed ones', () => {
    expect(isValidPortExpression('443')).toBe(true);
    expect(isValidPortExpression('443,8443')).toBe(true);
    expect(isValidPortExpression('114-514/810-1919,65530')).toBe(true);
    expect(isValidPortExpression('200,204,401-429,501-503')).toBe(true);
    expect(isValidPortExpression('')).toBe(false);
    expect(isValidPortExpression('0')).toBe(false);
    expect(isValidPortExpression('x')).toBe(false);
    expect(isValidPortExpression('9-1')).toBe(false);
  });
});

describe('isSinglePortExpression', () => {
  it('is true only for a single concrete port with no errors', () => {
    expect(isSinglePortExpression('8443')).toBe(true);
    expect(isSinglePortExpression(' 8443 ')).toBe(true);
    expect(isSinglePortExpression('80-81')).toBe(false);
    expect(isSinglePortExpression('80,81')).toBe(false);
    expect(isSinglePortExpression('')).toBe(false);
    expect(isSinglePortExpression('99999')).toBe(false);
  });
});

describe('normalizePortExpression', () => {
  it('sorts, merges adjacent/overlapping ranges and strips decorations', () => {
    expect(normalizePortExpression('443')).toBe('443');
    expect(normalizePortExpression('302,200')).toBe('200,302');
    expect(normalizePortExpression('10-20,15-25')).toBe('10-25');
    expect(normalizePortExpression('10-19,20-25')).toBe('10-25');
    expect(normalizePortExpression('5,5')).toBe('5');
    expect(normalizePortExpression('08')).toBe('8');
    expect(normalizePortExpression('65530,810-1919,114-514')).toBe(
      '114-514,810-1919,65530'
    );
    expect(normalizePortExpression('bad')).toBeNull();
    expect(normalizePortExpression('')).toBeNull();
  });

  it('keeps disjoint neighbours separated when not adjacent', () => {
    expect(normalizePortExpression('10,12')).toBe('10,12');
    expect(normalizePortExpression('10-11,13-14')).toBe('10-11,13-14');
  });
});

describe('expandPortExpression', () => {
  it('expands singles, lists and ranges', () => {
    expect(expandPortExpression('443').ports).toEqual([443]);
    expect(expandPortExpression('200,302').ports).toEqual([200, 302]);
    expect(expandPortExpression('10-12').ports).toEqual([10, 11, 12]);
    expect(expandPortExpression('114-514/65530').ports.length).toBe(402);
  });

  it('rejects overflow beyond the limit instead of materialising huge sets', () => {
    const ok = expandPortExpression(`1-${PORT_MAX}`);
    expect(ok.ports.length).toBe(PORT_MAX);

    const limited = expandPortExpression('1-65535', 1024);
    expect(limited.ports).toEqual([]);
    expect(limited.error?.code).toBe('overflow');
  });

  it('propagates the first syntax error', () => {
    const bad = expandPortExpression('x');
    expect(bad.ports).toEqual([]);
    expect(bad.error?.code).toBe('syntax');
  });
});
