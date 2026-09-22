import { parsePortExpression } from '../portExpression';
import type { ListenerIR } from '../types';
import type { ServerProblem } from './problems';
import { isValidListenAddress } from '../../shared/validation/syntax';
import {
  isValidDomain,
  isValidIpv4,
  isValidIpAddress,
} from '../../shared/validation/syntax';

// The string predicates below are shared infrastructure (see
// src/core/shared/validation/syntax.ts); they are re-exported so existing
// server-side import paths keep working.
export {
  isValidUuid,
  isValidIpv4,
  isValidIpv6,
  isValidIpAddress,
  isValidCidr,
  isValidHostname,
  isValidDomain,
  isValidHostPort,
  isValidUrl,
  isBase64,
  isHex,
  isValidRegex,
  looksLikePath,
  isValidListenAddress,
  isValidPem,
} from '../../shared/validation/syntax';

// What the Overview's Server list accepts — the addresses share links point
// at, so a bare domain or IP and nothing else. Digits-and-dots strings read
// as IPv4 to any user, so they must parse as one: without this rule,
// "256.1.1.1" and "1.2.3" would slip in on the hostname path, whose labels
// happily allow digits.
export function isValidServerAddress(value: string): boolean {
  const v = value.trim();
  if (/^[\d.]+$/.test(v)) return isValidIpv4(v);
  return isValidDomain(v) || isValidIpAddress(v);
}

export function validateCommonSyntax(listener: ListenerIR): ServerProblem[] {
  const problems: ServerProblem[] = [];
  const base = { listenerId: listener.id, listenerName: listener.name, section: 'common' };

  if (listener.name.trim() === '') {
    problems.push({ severity: 'error', code: 'server.problem.nameRequired', ...base, field: 'name' });
  }

  const portless = listener.type === 'tun';
  if (!portless && listener.listen.trim() !== '' && !isValidListenAddress(listener.listen)) {
    problems.push({
      severity: 'error',
      code: 'server.problem.listenInvalid',
      params: { value: listener.listen },
      ...base,
      field: 'listen',
    });
  }

  const port = parsePortExpression(listener.port);
  for (const err of portless ? [] : port.errors) {
    problems.push({
      severity: 'error',
      code:
        err.code === 'empty'
          ? 'server.problem.portRequired'
          : err.code === 'bounds'
            ? 'server.problem.portBounds'
            : 'server.problem.portSyntax',
      params: err.token ? { token: err.token } : undefined,
      ...base,
      field: 'port',
    });
  }

  if (listener.routingMark !== undefined && (listener.routingMark < 0 || listener.routingMark > 4294967295)) {
    problems.push({
      severity: 'error',
      code: 'server.problem.routingMarkBounds',
      ...base,
      field: 'routingMark',
    });
  }

  return problems;
}
