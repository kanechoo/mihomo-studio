export interface PortRange {
  lo: number;
  hi: number;
}

export type PortErrorCode = 'empty' | 'syntax' | 'order' | 'bounds' | 'overflow';

export interface PortError {
  code: PortErrorCode;
  token?: string;
}

export interface PortParseResult {
  ranges: PortRange[];
  errors: PortError[];
}

export const PORT_MIN = 1;
export const PORT_MAX = 65535;
const EXPAND_LIMIT = 65535;
const SEPARATOR_RE = /[,/]/;
const TOKEN_RE = /^\d+$/;

export function parsePortExpression(expr: string): PortParseResult {
  const trimmed = expr.trim();
  if (trimmed === '') {
    return { ranges: [], errors: [{ code: 'empty' }] };
  }

  const ranges: PortRange[] = [];
  const errors: PortError[] = [];

  for (const rawToken of trimmed.split(SEPARATOR_RE)) {
    const token = rawToken.trim();
    if (token === '') {
      errors.push({ code: 'syntax', token: rawToken });
      continue;
    }

    const dashIndex = token.indexOf('-');
    const left = dashIndex === -1 ? token : token.slice(0, dashIndex);
    const right = dashIndex === -1 ? token : token.slice(dashIndex + 1);

    if (!TOKEN_RE.test(left) || !TOKEN_RE.test(right) || (dashIndex !== -1 && right === '')) {
      errors.push({ code: 'syntax', token });
      continue;
    }

    const lo = Number(left);
    const hi = Number(right);

    if (lo < PORT_MIN || hi > PORT_MAX || lo > PORT_MAX || hi < PORT_MIN) {
      errors.push({ code: 'bounds', token });
      continue;
    }
    if (dashIndex !== -1 && lo > hi) {
      errors.push({ code: 'order', token });
      continue;
    }

    ranges.push({ lo, hi: dashIndex === -1 ? lo : hi });
  }

  return { ranges, errors };
}

export function isValidPortExpression(expr: string): boolean {
  return parsePortExpression(expr).errors.length === 0;
}

export function isSinglePortExpression(expr: string): boolean {
  const { ranges, errors } = parsePortExpression(expr);
  return (
    errors.length === 0 && ranges.length === 1 && ranges[0].lo === ranges[0].hi
  );
}

export function normalizePortExpression(expr: string): string | null {
  const { ranges, errors } = parsePortExpression(expr);
  if (errors.length > 0) return null;

  const sorted = [...ranges].sort((a, b) => a.lo - b.lo || a.hi - b.hi);
  const merged: PortRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.lo <= last.hi + 1) {
      last.hi = Math.max(last.hi, range.hi);
    } else {
      merged.push({ ...range });
    }
  }

  return merged.map((r) => (r.lo === r.hi ? `${r.lo}` : `${r.lo}-${r.hi}`)).join(',');
}

export function expandPortExpression(
  expr: string,
  limit: number = EXPAND_LIMIT
): { ports: number[]; error?: PortError } {
  const { ranges, errors } = parsePortExpression(expr);
  if (errors.length > 0) {
    return { ports: [], error: errors[0] };
  }

  const total = ranges.reduce((sum, r) => sum + (r.hi - r.lo + 1), 0);
  if (total > limit) {
    return { ports: [], error: { code: 'overflow' } };
  }

  const ports: number[] = [];
  for (const range of ranges) {
    for (let port = range.lo; port <= range.hi; port++) {
      ports.push(port);
    }
  }
  return { ports };
}
