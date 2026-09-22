import type { ListenerIR } from '../../types';
import type { ServerProblem } from '../problems';
import {
  isBase64,
  isValidHostPort,
} from '../syntax';
import { parsePortExpression } from '../../portExpression';

function base(listener: ListenerIR, field: string, section: 'protocol' | 'common' = 'protocol') {
  return { listenerId: listener.id, listenerName: listener.name, section, field };
}

export function validateMieru(listener: ListenerIR): ServerProblem[] {
  const problems: ServerProblem[] = [];
  const pattern = listener.protocol['traffic-pattern'];
  if (typeof pattern === 'string' && pattern.trim() !== '' && !isBase64(pattern.trim())) {
    problems.push({
      severity: 'warning',
      code: 'server.problem.mieruPatternNotBase64',
      ...base(listener, 'protocol.traffic-pattern'),
    });
  }
  return problems;
}

export function validateSudoku(listener: ListenerIR): ServerProblem[] {
  const problems: ServerProblem[] = [];

  const port = parsePortExpression(listener.port);
  if (port.errors.length === 0) {
    const span = port.ranges.reduce((sum, r) => sum + (r.hi - r.lo + 1), 0);
    if (span > 1) {
      problems.push({
        severity: 'error',
        code: 'server.problem.sudokuSinglePort',
        ...base(listener, 'port', 'common'),
      });
    }
  }

  if (listener.protocol['aead-method'] === 'none') {
    problems.push({
      severity: 'warning',
      code: 'server.problem.sudokuAeadNone',
      ...base(listener, 'protocol.aead-method'),
    });
  }

  const min = listener.protocol['padding-min'];
  const max = listener.protocol['padding-max'];
  if (typeof min === 'number' && typeof max === 'number' && min > max) {
    problems.push({
      severity: 'error',
      code: 'server.problem.sudokuPaddingRange',
      ...base(listener, 'protocol.padding-min'),
    });
  }

  for (const key of ['custom-table', 'custom-tables'] as const) {
    const value = listener.protocol[key];
    const tables =
      Array.isArray(value)
        ? value.map((entry) => String(entry))
        : typeof value === 'string' && value !== ''
          ? [value]
          : [];
    for (const table of tables) {
      if (!isValidSudokuTable(table)) {
        problems.push({
          severity: 'error',
          code: 'server.problem.sudokuTableInvalid',
          params: { value: table },
          ...base(listener, `protocol.${key}`),
        });
      }
    }
  }

  const fallback = listener.protocol.fallback;
  if (typeof fallback === 'string' && fallback.trim() !== '' && !isValidHostPort(fallback)) {
    problems.push({
      severity: 'error',
      code: 'server.problem.sudokuFallbackInvalid',
      ...base(listener, 'protocol.fallback'),
    });
  }

  return problems;
}

export function isValidSudokuTable(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') return false;
  if (/^[xpv]{8}$/.test(trimmed)) {
    return (
      (trimmed.match(/x/g) ?? []).length === 2 &&
      (trimmed.match(/p/g) ?? []).length === 2 &&
      (trimmed.match(/v/g) ?? []).length === 4
    );
  }
  return false;
}

export function validateTrustTunnel(listener: ListenerIR): ServerProblem[] {
  const problems: ServerProblem[] = [];
  const hasCert = (listener.tls.certificate?.value ?? '') !== '';
  const hasKey = (listener.tls.privateKey?.value ?? '') !== '';

  if (!hasCert || !hasKey) {
    problems.push({
      severity: 'error',
      code: 'server.problem.trusttunnelCertRequired',
      listenerId: listener.id,
      listenerName: listener.name,
      section: 'tls',
      field: hasCert ? 'tls.privateKey' : 'tls.certificate',
    });
  }

  return problems;
}

export function validateTunListener(listener: ListenerIR): ServerProblem[] {
  const problems: ServerProblem[] = [];
  const proto = listener.protocol;

  // dns-hijack entries accept `any:53`, `host:port` and an optional
  // `tcp://`/`udp://` scheme prefix.
  if (Array.isArray(proto['dns-hijack'])) {
    for (const raw of proto['dns-hijack'] as unknown[]) {
      if (typeof raw !== 'string' || raw.trim() === '') continue;
      const entry = raw.trim().replace(/^tcp:\/\//, '').replace(/^udp:\/\//, '');
      const hostPart = entry.split(':').slice(0, -1).join(':');
      const ok =
        hostPart === 'any' ||
        isValidHostPort(entry) ||
        isValidListenAddressLite(entry);
      if (!ok) {
        problems.push({
          severity: 'error',
          code: 'server.problem.tunDnsHijackInvalid',
          params: { value: raw },
          ...base(listener, 'protocol.dns-hijack'),
        });
      }
    }
  }

  const needsAutoRoute: Array<[string, string]> = [
    ['auto-redirect', 'server.problem.tunAutoRedirectNeedsAutoRoute'],
    ['strict-route', 'server.problem.tunStrictRouteNeedsAutoRoute'],
    ['include-uid', 'server.problem.tunFilterNeedsAutoRoute'],
    ['exclude-uid', 'server.problem.tunFilterNeedsAutoRoute'],
    ['include-uid-range', 'server.problem.tunFilterNeedsAutoRoute'],
    ['exclude-uid-range', 'server.problem.tunFilterNeedsAutoRoute'],
    ['include-mac-address', 'server.problem.tunFilterNeedsAutoRoute'],
    ['exclude-mac-address', 'server.problem.tunFilterNeedsAutoRoute'],
    ['include-android-user', 'server.problem.tunFilterNeedsAutoRoute'],
    ['include-package', 'server.problem.tunFilterNeedsAutoRoute'],
    ['exclude-package', 'server.problem.tunFilterNeedsAutoRoute'],
  ];
  const autoRouteOn = proto['auto-route'] === true;
  for (const [key, code] of needsAutoRoute) {
    const value = (proto as Record<string, unknown>)[key];
    const present = Array.isArray(value) ? value.length > 0 : value === true;
    if (present && !autoRouteOn) {
      problems.push({
        severity: 'warning',
        code,
        ...base(listener, `protocol.${key}`),
      });
    }
  }

  const includeIface = proto['include-interface'];
  const excludeIface = proto['exclude-interface'];
  const hasInclude = Array.isArray(includeIface) && includeIface.length > 0;
  const hasExclude = Array.isArray(excludeIface) && excludeIface.length > 0;
  if (hasInclude && hasExclude) {
    problems.push({
      severity: 'warning',
      code: 'server.problem.tunInterfaceConflict',
      ...base(listener, 'protocol.include-interface'),
    });
  }

  return problems;
}

function isValidListenAddressLite(value: string): boolean {
  // Bare addresses without ports (`0.0.0.0`) are valid hijack targets too.
  return /^(\*|\d{1,3}(\.\d{1,3}){3}|::|[0-9a-fA-F:]+)$/.test(value);
}
